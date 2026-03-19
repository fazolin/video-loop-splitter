const { spawn } = require('child_process');
const path = require('path');
const { getDuration, hasAudio } = require('./probe');

// Hardcoded path to ffmpeg (Windows)
const FFMPEG_PATH = process.platform === 'win32'
  ? 'C:\\Users\\fazol\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe'
  : 'ffmpeg';

/**
 * Calculate dissolve duration based on video duration
 * @param {number} duration - Video duration in seconds
 * @returns {number} Dissolve duration in seconds
 */
function calculateDissolveDuration(duration) {
  if (duration <= 5) return 0.4;
  if (duration <= 30) return 0.8;
  return 1.2;
}

/**
 * Validate and cap dissolve duration
 * Ensure dissolve doesn't exceed 20% of each part duration
 * @param {number} dissolveDuration - Desired dissolve duration
 * @param {number} partDuration - Duration of each part in seconds
 * @returns {number} Validated dissolve duration
 */
function validateDissolveDuration(dissolveDuration, partDuration) {
  const maxDissolve = partDuration * 0.2;
  return Math.min(dissolveDuration, maxDissolve);
}

/**
 * Build ffmpeg command for creating loop video
 * @param {Object} params - Processing parameters
 * @returns {string[]} ffmpeg command arguments
 */
function buildFfmpegCommand(params) {
  const {
    inputPath,
    outputPath,
    duration,
    splitRatio,
    dissolveDuration,
    hasAudioTrack,
  } = params;

  const splitPoint = duration * splitRatio;
  const xfadeOffset = splitPoint - dissolveDuration;

  const args = [
    '-i', `"${inputPath}"`,
    '-i', `"${inputPath}"`,
    '-filter_complex',
    buildFilterComplex(
      splitPoint,
      duration,
      dissolveDuration,
      xfadeOffset,
      hasAudioTrack
    ),
    '-map', '[v]',
    ...(hasAudioTrack ? ['-map', '[a]'] : []),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ];

  if (hasAudioTrack) {
    args.push('-c:a', 'aac');
  }

  args.push(`"${outputPath}"`);

  return args;
}

/**
 * Build ffmpeg filter_complex string
 */
function buildFilterComplex(splitPoint, duration, dissolveDuration, xfadeOffset, hasAudio) {
  let filterComplex = `[0:v]trim=start=${splitPoint}:end=${duration},setpts=PTS-STARTPTS[b];[0:v]trim=start=0:end=${splitPoint},setpts=PTS-STARTPTS[a];[b][a]xfade=transition=dissolve:duration=${dissolveDuration}:offset=${xfadeOffset}[v]`;

  if (hasAudio) {
    filterComplex += `;[0:a]atrim=start=${splitPoint}:end=${duration},asetpts=PTS-STARTPTS[b_audio];[0:a]atrim=start=0:end=${splitPoint},asetpts=PTS-STARTPTS[a_audio];[b_audio][a_audio]acrossfade=d=${dissolveDuration}[a]`;
  }

  return filterComplex;
}

/**
 * Execute ffmpeg command
 * @param {string[]} args - ffmpeg arguments
 * @returns {Promise<void>}
 */
function executeFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    const errorChunks = [];

    ffmpeg.stderr.on('data', (data) => {
      errorChunks.push(data);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorOutput = Buffer.concat(errorChunks).toString('utf8');
        reject(new Error(`ffmpeg exited with code ${code}: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Process a single video file
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
async function processVideo(options) {
  const {
    inputPath,
    outputPath,
    splitRatio = 0.5,
    dryRun = false,
    overwrite = false,
  } = options;

  const fileName = path.basename(inputPath);

  try {
    // Check output file exists
    if (!overwrite && require('fs').existsSync(outputPath)) {
      return {
        status: 'skipped',
        file: fileName,
        reason: 'Output file already exists',
      };
    }

    // Get video duration
    const duration = getDuration(inputPath);
    const splitPoint = duration * splitRatio;
    const audioTrack = hasAudio(inputPath);

    // Calculate dissolve
    let dissolveDuration = calculateDissolveDuration(duration);
    dissolveDuration = validateDissolveDuration(dissolveDuration, splitPoint);

    const result = {
      status: 'completed',
      file: fileName,
      duration: duration.toFixed(2),
      splitPoint: splitPoint.toFixed(2),
      dissolveDuration: dissolveDuration.toFixed(2),
      hasAudio: audioTrack,
    };

    if (dryRun) {
      result.status = 'dry-run';
      return result;
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    require('fs').mkdirSync(outputDir, { recursive: true });

    // Build and execute ffmpeg command
    const args = buildFfmpegCommand({
      inputPath,
      outputPath,
      duration,
      splitRatio,
      dissolveDuration,
      hasAudioTrack: audioTrack,
    });

    await executeFFmpeg(args);

    return result;
  } catch (error) {
    return {
      status: 'error',
      file: fileName,
      error: error.message,
    };
  }
}

module.exports = processVideo;
