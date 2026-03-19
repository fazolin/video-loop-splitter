const { execSync } = require('child_process');
const path = require('path');

/**
 * Get video duration using ffprobe
 * @param {string} filePath - Path to video file
 * @returns {number} Duration in seconds
 */
function getDuration(filePath) {
  try {
    const escapedPath = `"${filePath}"`;
    const command = process.platform === 'win32'
      ? `ffprobe -v error -show_entries format=duration -of csv=p=0 ${escapedPath}`
      : `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`;
    
    const output = execSync(command, { encoding: 'utf8', shell: true }).trim();
    const duration = parseFloat(output);
    
    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${output}`);
    }
    
    return duration;
  } catch (error) {
    throw new Error(`Failed to probe ${path.basename(filePath)}: ${error.message}`);
  }
}

/**
 * Check if file has audio stream
 * @param {string} filePath - Path to video file
 * @returns {boolean} True if audio stream exists
 */
function hasAudio(filePath) {
  try {
    const escapedPath = `"${filePath}"`;
    const command = process.platform === 'win32'
      ? `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 ${escapedPath}`
      : `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`;
    
    const output = execSync(command, { encoding: 'utf8', shell: true }).trim();
    return output.includes('audio');
  } catch {
    return false;
  }
}

module.exports = {
  getDuration,
  hasAudio,
};
