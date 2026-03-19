#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const processVideo = require('./lib/process');
const Queue = require('./lib/queue');

const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];

/**
 * Parse multiple paths pasted as one line (Windows "Paste as One Line" feature)
 * Detects Windows paths (C:\...) and Unix paths (/...)
 * Handles paths with spaces and quotes correctly
 * @param {string} input - The pasted paths string
 * @returns {string[]} - Array of individual paths
 */
function parsePastedPaths(input) {
  // Clean up input: remove newlines and extra whitespace that can occur from copy-paste
  let cleanInput = input.replace(/[\r\n]+/g, '').trim();
  
  // First, try to split by quoted paths (most common from Windows Explorer)
  // Pattern: "C:\path\to\file" or "D:\path with spaces"
  const quotedPattern = /"([^"]+)"/g;
  const quotedMatches = [];
  let match;
  
  while ((match = quotedPattern.exec(cleanInput)) !== null) {
    let cleanPath = match[1].trim();
    
    // Skip empty paths
    if (!cleanPath) continue;
    
    // Try to recover paths that are missing drive letter
    // If path doesn't start with drive letter but contains known patterns
    // and we have other valid paths, assume it's on same drive
    if (!cleanPath.match(/^[A-Za-z]:/) && !cleanPath.startsWith('/')) {
      // Check if this looks like it's missing a drive letter (starts with folder name)
      if (cleanPath.match(/^[a-z]/i) && cleanPath.includes('\\')) {
        // Try to infer the drive from other paths in the same batch
        // For now, we'll add it to a separate list to handle after
        continue;
      }
    }
    
    // Only add valid paths that have drive letter or root
    if (cleanPath.match(/^[A-Za-z]:/) || cleanPath.startsWith('/')) {
      quotedMatches.push(cleanPath);
    }
  }
  
  // If we found valid quoted paths, return them
  if (quotedMatches.length > 0) {
    return quotedMatches;
  }
  
  // Fallback: find paths by drive letters if not quoted
  const pathStarts = [];
  
  // Look for Windows drive letters (C:, D:, etc.)
  const drivePattern = /[A-Za-z]:/g;
  
  while ((match = drivePattern.exec(cleanInput)) !== null) {
    pathStarts.push(match.index);
  }
  
  // Look for Unix absolute paths (starting with /)
  const unixPattern = /(?:^|\s)\/[^\s]/g;
  while ((match = unixPattern.exec(cleanInput)) !== null) {
    pathStarts.push(match.index + (match[0].startsWith('/') ? 0 : 1));
  }
  
  // If no multiple paths found, return as single path (if valid)
  if (pathStarts.length <= 1) {
    const trimmed = cleanInput.trim().replace(/^["']+|["']+$/g, '');
    // Reject invalid paths that don't start with drive letter or /
    if (trimmed && (trimmed.match(/^[A-Za-z]:/) || trimmed.startsWith('/'))) {
      return [trimmed];
    }
    return [];
  }
  
  // Sort positions
  pathStarts.sort((a, b) => a - b);
  
  // Extract individual paths
  const paths = [];
  for (let i = 0; i < pathStarts.length; i++) {
    const start = pathStarts[i];
    const end = pathStarts[i + 1] || cleanInput.length;
    let extractedPath = cleanInput.substring(start, end).trim();
    
    // Remove quotes from ends
    extractedPath = extractedPath.replace(/^["']+|["']+$/g, '');
    
    // Only add valid paths
    if (extractedPath && (extractedPath.match(/^[A-Za-z]:/) || extractedPath.startsWith('/'))) {
      paths.push(extractedPath);
    }
  }
  
  return paths.length > 0 ? paths : [];
}

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
 * Prompt user for multiple input paths (files or directories)
 * Supports single path per prompt OR multiple paths pasted at once (Windows "Paste as One Line")
 * Returns array of {type: 'file'|'dir', path: string}
 */
async function promptForMultipleInputs() {
  const inputs = [];
  console.log('\n📁 Enter input paths (files or directories). Leave blank when done:');
  console.log('💡 Tip: You can paste multiple paths at once (via "Paste as One Line")\n');

  while (true) {
    const pathInput = await prompt('Path');

    if (!pathInput) {
      if (inputs.length === 0) {
        console.error('❌ At least one input path is required');
        continue;
      }
      // User is done entering paths
      console.log(''); // blank line for clarity
      break;
    }

    // Skip if user accidentally pasted output text or prompts
    if (pathInput.includes('Enter input paths') || 
        pathInput.includes('video-loop-splitter') || 
        pathInput.includes('Advanced options') ||
        pathInput.includes('Split ratio')) {
      console.error('⚠️  It looks like you pasted terminal output. Please paste only file/folder paths.');
      console.error('   (You can paste multiple paths separated by spaces or on separate lines)\n');
      continue;
    }

    // Parse multiple paths if user pasted them at once
    const pathsToProcess = parsePastedPaths(pathInput);

    if (pathsToProcess.length === 0) {
      console.error('\n❌ No valid paths detected.');
      console.error('   Make sure paths start with a drive letter (C:, D:, E:, etc.) or / (Unix/Mac)');
      console.error('   If using "Paste as One Line", check that the FIRST path has the drive letter.');
      console.error('   Input received: ' + pathInput.substring(0, 80) + (pathInput.length > 80 ? '...' : ''));
      console.error('');
      continue;
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const singlePath of pathsToProcess) {
      // Remove surrounding quotes if present (handles: "path", 'path', or path)
      let trimmedPath = singlePath.trim();
      trimmedPath = trimmedPath.replace(/^["']+|["']+$/g, '');
      
      // Remove trailing backslash/slash (unless it's root like C:\)
      if (trimmedPath.length > 3) {
        trimmedPath = trimmedPath.replace(/[\\\/]+$/, '');
      }
      
      const fullPath = path.resolve(trimmedPath);

      if (!fs.existsSync(fullPath)) {
        console.error(`   ❌ Path does not exist: ${fullPath}`);
        skippedCount++;
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          console.error(`   ❌ Unsupported file type: ${ext} (${fullPath})`);
          skippedCount++;
          continue;
        }
        inputs.push({ type: 'file', path: fullPath });
        console.log(`   ✅ Added file: ${path.basename(fullPath)}`);
        addedCount++;
      } else if (stat.isDirectory()) {
        inputs.push({ type: 'dir', path: fullPath });
        console.log(`   ✅ Added folder: ${path.basename(fullPath)}`);
        addedCount++;
      } else {
        console.error(`   ❌ Path is neither a file nor a directory: ${fullPath}`);
        skippedCount++;
        continue;
      }
    }

    if (addedCount === 0 && skippedCount > 0) {
      console.error(`   → None of the paths were valid. Try again.\n`);
      continue;
    }

    console.log('');
  }

  return inputs;
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

  // Input paths (multiple)
  if (!options.inputs || options.inputs.length === 0) {
    const inputPaths = await promptForMultipleInputs();
    options.inputs = inputPaths.map(item => item.path);
  }

  // Output directory (optional, for directories)
  if (!options.output || options.output === './loops') {
    const outputInput = await prompt('📁 Enter output directory path (optional, press Enter for auto)', '');
    if (outputInput) {
      options.output = path.resolve(outputInput);
    } else {
      options.output = null; // auto
    }
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
    inputs: [],
    output: './loops',
    split: 0.5,
    workers: 2,
    dryRun: false,
    overwrite: false,
    recursive: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.inputs.push(args[++i]);
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
 * Collect all video processing tasks from inputs
 */
function collectTasks(inputs, globalOutput, recursive = true) {
  const tasks = [];

  for (const inputPath of inputs) {
    if (!fs.existsSync(inputPath)) {
      console.warn(`Warning: Input path does not exist: ${inputPath}`);
      continue;
    }

    const stat = fs.statSync(inputPath);
    if (stat.isFile()) {
      // Single file
      const ext = path.extname(inputPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        console.warn(`Warning: Unsupported file type: ${inputPath}`);
        continue;
      }
      const outputDir = path.join(path.dirname(inputPath), 'loops');
      const baseName = path.basename(inputPath, ext);
      const outputPath = path.join(outputDir, `${baseName}_loop${ext}`);
      tasks.push({ inputPath, outputPath });
    } else if (stat.isDirectory()) {
      // Directory
      const outputDir = globalOutput || path.join(inputPath, 'loops');
      const videoFiles = findVideoFiles(inputPath, recursive);
      for (const videoFile of videoFiles) {
        const relativePath = path.relative(inputPath, videoFile);
        const baseName = path.basename(videoFile, path.extname(videoFile));
        const ext = path.extname(videoFile);
        const outputFileName = `${baseName}_loop${ext}`;
        const outputPath = path.join(outputDir, outputFileName);
        tasks.push({ inputPath: videoFile, outputPath });
      }
    }
  }

  return tasks;
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
  --input <path>          Input file or directory (can be used multiple times)
  --output <dir>          Output directory (optional, auto for files)
  --split <ratio>         Split ratio between 0.2 and 0.8 (default: 0.5)
  --workers <num>         Number of parallel workers (default: 2)
  --dry-run               Show what would be done without processing
  --overwrite             Overwrite existing output files
  --no-recursive          Don't scan subdirectories
  --help, -h              Show this help message
  --version, -v           Show version

Examples:
  node index.js                           (run in interactive mode)
  node index.js --input ./videos --output ./loops
  node index.js --input video.mp4 --input ./videos --split 0.4 --workers 4
  node index.js --input ./videos --dry-run
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

  // If no inputs provided, use interactive mode
  if (!options.inputs || options.inputs.length === 0) {
    await interactiveSetup(options);
  } else {
    validateOptions(options, true);
  }

  console.log('🎬 video-loop-splitter v1.0.0\n');

  const tasks = collectTasks(options.inputs, options.output, options.recursive);

  if (tasks.length === 0) {
    console.log('No video files found in the input paths.');
    process.exit(0);
  }

  console.log(`Found ${tasks.length} video file(s)\n`);
  console.log('Options:');
  console.log(`  Inputs:    ${options.inputs.join(', ')}`);
  if (options.output) {
    console.log(`  Output:    ${options.output}`);
  } else {
    console.log(`  Output:    auto (loops folder next to each file)`);
  }
  console.log(`  Split:     ${(options.split * 100).toFixed(0)}%`);
  console.log(`  Workers:   ${options.workers}`);
  console.log(`  Mode:      ${options.dryRun ? 'DRY RUN' : 'PROCESSING'}`);
  console.log('');

  const queue = new Queue(options.workers);
  const startTime = Date.now();
  const results = [];

  for (const task of tasks) {
    queue.add(async () => {
      const { inputPath, outputPath } = task;
      const fileName = path.basename(inputPath);

      try {
        const result = await processVideo({
          inputPath,
          outputPath,
          splitRatio: options.split,
          dryRun: options.dryRun,
          overwrite: options.overwrite,
        });

        results.push(result);

        if (result.status === 'error') {
          console.log(`❌ ${fileName}`);
          console.log(`   Error: ${result.error}`);
        } else if (result.status === 'skipped') {
          console.log(`⏭️  ${fileName}`);
          console.log(`   Skipped: ${result.reason}`);
        } else if (result.status === 'dry-run') {
          console.log(`🔍 ${fileName} (DRY RUN)`);
          console.log(`   Duration: ${result.duration}s | Split: ${result.splitPoint}s | Dissolve: ${result.dissolveDuration}s | Audio: ${result.hasAudio ? 'yes' : 'no'}`);
        } else {
          console.log(`✅ ${fileName}`);
          console.log(`   Duration: ${result.duration}s | Split: ${result.splitPoint}s | Dissolve: ${result.dissolveDuration}s | Audio: ${result.hasAudio ? 'yes' : 'no'}`);
        }
      } catch (error) {
        results.push({
          status: 'error',
          file: fileName,
          error: error.message,
        });
        console.log(`❌ ${fileName}`);
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
