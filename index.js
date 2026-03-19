#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const processVideo = require('./lib/process');
const Queue = require('./lib/queue');

const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];

/**
 * Create readline interface for user input
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input with question and validation
 */
function prompt(question, defaultValue = null) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    const displayQuestion = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;

    rl.question(displayQuestion, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt user for path with validation
 */
async function promptForPath(pathType = 'input') {
  const isInput = pathType === 'input';
  const question = isInput
    ? '📁 Enter input directory path (containing videos)'
    : '📁 Enter output directory path';

  while (true) {
    const pathInput = await prompt(question);

    if (!pathInput) {
      console.error('❌ Path cannot be empty');
      continue;
    }

    const fullPath = path.resolve(pathInput);

    if (isInput) {
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Directory does not exist: ${fullPath}`);
        continue;
      }
      if (!fs.statSync(fullPath).isDirectory()) {
        console.error(`❌ Path is not a directory: ${fullPath}`);
        continue;
      }
    }

    return fullPath;
  }
}

/**
 * Prompt user for numeric option
 */
async function promptForNumber(question, defaultValue, min = null, max = null) {
  while (true) {
    const answer = await prompt(question, defaultValue);
    const num = parseFloat(answer);

    if (isNaN(num)) {
      console.error('❌ Please enter a valid number');
      continue;
    }

    if (min !== null && num < min) {
      console.error(`❌ Value must be at least ${min}`);
      continue;
    }

    if (max !== null && num > max) {
      console.error(`❌ Value must be at most ${max}`);
      continue;
    }

    return num;
  }
}

/**
 * Interactive CLI setup
 */
async function interactiveSetup(options) {
  console.log('\n🎬 video-loop-splitter — Interactive Setup\n');

  // Input directory
  if (!options.input) {
    options.input = await promptForPath('input');
  }

  // Output directory
  if (!options.output || options.output === './output') {
    const defaultOutput = path.join(options.input, 'output');
    const customPath = await prompt('📁 Enter output directory path', defaultOutput);
    options.output = path.resolve(customPath);
  }

  // Split ratio
  console.log('\n⚙️  Advanced options (press Enter for defaults)\n');
  const splitInput = await prompt('Split ratio (0.2 to 0.8)', '0.5');
  options.split = parseFloat(splitInput) || 0.5;

  if (options.split < 0.2 || options.split > 0.8) {
    console.warn('⚠️  Split ratio out of range, using 0.5');
    options.split = 0.5;
  }

  // Workers
  const workersInput = await prompt('Number of parallel workers', '2');
  options.workers = parseInt(workersInput, 10) || 2;

  if (options.workers < 1) {
    console.warn('⚠️  Workers must be at least 1, using 1');
    options.workers = 1;
  }

  // Dry run
  const dryRunInput = await prompt('Dry run mode? (y/n)', 'n');
  options.dryRun = dryRunInput.toLowerCase().startsWith('y');

  // Overwrite
  const overwriteInput = await prompt('Overwrite existing files? (y/n)', 'n');
  options.overwrite = overwriteInput.toLowerCase().startsWith('y');

  console.log('');
  return options;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: './output',
    split: 0.5,
    workers: 2,
    dryRun: false,
    overwrite: false,
    recursive: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.input = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--split':
        options.split = parseFloat(args[++i]);
        break;
      case '--workers':
        options.workers = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--no-recursive':
        options.recursive = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--version':
      case '-v':
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        console.log(pkg.version);
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Validate command line options
 */
function validateOptions(options, isInteractive = false) {
  if (!options.input && !isInteractive) {
    console.error('Error: --input is required or run without flags for interactive mode');
    printHelp();
    process.exit(1);
  }

  if (options.input && !fs.existsSync(options.input)) {
    console.error(`Error: Input directory does not exist: ${options.input}`);
    process.exit(1);
  }

  if (options.input && !fs.statSync(options.input).isDirectory()) {
    console.error(`Error: Input path is not a directory: ${options.input}`);
    process.exit(1);
  }

  if (options.split < 0.2 || options.split > 0.8) {
    console.error('Error: --split must be between 0.2 and 0.8');
    process.exit(1);
  }

  if (options.workers < 1) {
    console.error('Error: --workers must be at least 1');
    process.exit(1);
  }
}

/**
 * Find all video files in input directory
 */
function findVideoFiles(dirPath, recursive = true) {
  const videos = [];

  function scan(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && recursive) {
          scan(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            videos.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Failed to scan directory ${dir}: ${error.message}`);
    }
  }

  scan(dirPath);
  return videos;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
video-loop-splitter

Usage:
  node index.js                           (interactive mode)
  node index.js --input <dir> --output <dir> [options]

Options:
  --input <dir>           Input directory containing videos
  --output <dir>          Output directory for processed videos (default: ./output)
  --split <ratio>         Split ratio between 0.2 and 0.8 (default: 0.5)
  --workers <num>         Number of parallel workers (default: 2)
  --dry-run               Show what would be done without processing
  --overwrite             Overwrite existing output files
  --no-recursive          Don't scan subdirectories
  --help, -h              Show this help message
  --version, -v           Show version

Examples:
  node index.js                           (run in interactive mode)
  node index.js --input ./videos --output ./output
  node index.js --input ./videos --output ./output --split 0.4 --workers 4
  node index.js --input ./videos --output ./output --dry-run
  `);
}

/**
 * Format file size in human readable format
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main CLI function
 */
async function main() {
  const options = parseArgs();

  // If no input provided, use interactive mode
  if (!options.input) {
    await interactiveSetup(options);
  } else {
    validateOptions(options, false);
  }

  // Final validation
  if (!fs.existsSync(options.input)) {
    console.error(`❌ Input directory does not exist: ${options.input}`);
    process.exit(1);
  }

  console.log('🎬 video-loop-splitter v1.0.0\n');

  const videoFiles = findVideoFiles(options.input, options.recursive);

  if (videoFiles.length === 0) {
    console.log('No video files found in the input directory.');
    process.exit(0);
  }

  console.log(`Found ${videoFiles.length} video file(s)\n`);
  console.log('Options:');
  console.log(`  Input:     ${options.input}`);
  console.log(`  Output:    ${options.output}`);
  console.log(`  Split:     ${(options.split * 100).toFixed(0)}%`);
  console.log(`  Workers:   ${options.workers}`);
  console.log(`  Mode:      ${options.dryRun ? 'DRY RUN' : 'PROCESSING'}`);
  console.log('');

  const queue = new Queue(options.workers);
  const startTime = Date.now();
  const results = [];

  for (const videoFile of videoFiles) {
    queue.add(async () => {
      const relativePath = path.relative(options.input, videoFile);
      const baseName = path.basename(videoFile, path.extname(videoFile));
      const ext = path.extname(videoFile);
      const outputFileName = `${baseName}_loop${ext}`;
      const outputPath = path.join(options.output, outputFileName);

      try {
        const result = await processVideo({
          inputPath: videoFile,
          outputPath,
          splitRatio: options.split,
          dryRun: options.dryRun,
          overwrite: options.overwrite,
        });

        results.push(result);

        if (result.status === 'error') {
          console.log(`❌ ${relativePath}`);
          console.log(`   Error: ${result.error}`);
        } else if (result.status === 'skipped') {
          console.log(`⏭️  ${relativePath}`);
          console.log(`   Skipped: ${result.reason}`);
        } else if (result.status === 'dry-run') {
          console.log(`🔍 ${relativePath} (DRY RUN)`);
          console.log(`   Duration: ${result.duration}s | Split: ${result.splitPoint}s | Dissolve: ${result.dissolveDuration}s | Audio: ${result.hasAudio ? 'yes' : 'no'}`);
        } else {
          console.log(`✅ ${relativePath}`);
          console.log(`   Duration: ${result.duration}s | Split: ${result.splitPoint}s | Dissolve: ${result.dissolveDuration}s | Audio: ${result.hasAudio ? 'yes' : 'no'}`);
        }
      } catch (error) {
        results.push({
          status: 'error',
          file: path.basename(videoFile),
          error: error.message,
        });
        console.log(`❌ ${relativePath}`);
        console.log(`   Error: ${error.message}`);
      }
    });
  }

  await queue.drain();

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const completed = results.filter(r => r.status === 'completed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const dryRuns = results.filter(r => r.status === 'dry-run').length;

  console.log('\n' + '='.repeat(50));
  console.log(`Completed: ${completed} | Skipped: ${skipped} | Errors: ${errors} | Dry-runs: ${dryRuns}`);
  console.log(`Total time: ${elapsedSeconds}s`);
  console.log('='.repeat(50));

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
