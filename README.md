# video-loop-splitter

> **CLI tool to create seamless looping videos using ffmpeg** — splits a video in two, swaps the halves, and adds a dissolve transition.

Create perfectly looping videos with minimal perceivable seams using intelligent dissolve transitions. Batch process entire directories with parallel worker support.

## Features

- ✨ **Seamless looping**: Splits video in two halves, reverses them, and adds a smooth dissolve transition
- 📁 **Batch processing**: Process entire directories recursively with a single command
- ⚡ **Parallel workers**: Configurable worker threads for faster processing
- 🎚️ **Smart dissolves**: Automatic dissolve duration based on video length (0.4s–1.2s)
- 🖥️ **Cross-platform**: Works on Windows, macOS, and Linux
- 🔧 **Flexible splitting**: Customize split ratio (20%–80% of video)
- 🎬 **Audio support**: Preserves and smooths audio transitions with `acrossfade`
- 🧪 **Dry-run mode**: Preview operations without processing
- 📊 **Detailed logging**: Per-file metrics and comprehensive reports

## Requirements

- **Node.js** 18.0.0 or higher
- **FFmpeg** & **FFprobe** installed and available in your system PATH

### Installing FFmpeg

**Windows** (via Chocolatey or manual):
```bash
# Using Chocolatey
choco install ffmpeg

# Or download: https://ffmpeg.org/download.html
```

**macOS** (via Homebrew):
```bash
brew install ffmpeg
```

**Linux** (Ubuntu/Debian):
```bash
sudo apt-get update && sudo apt-get install ffmpeg
```

**Linux** (Fedora/RHEL):
```bash
sudo dnf install ffmpeg
```

## Installation

### From GitHub (Clone & Run)

```bash
git clone https://github.com/your-username/video-loop-splitter.git
cd video-loop-splitter
node index.js --input ./videos --output ./output
```

### As a global CLI tool (via npm)

```bash
npm install -g video-loop-splitter
video-loop-splitter --input ./videos --output ./output
```

## Usage

### Basic Usage

```bash
node index.js --input ./videos --output ./output
```

### All Options

| Flag | Default | Description |
|------|---------|-------------|
| `--input <dir>` | *(required)* | Input directory containing video files |
| `--output <dir>` | `./output` | Output directory for processed videos |
| `--split <ratio>` | `0.5` | Split ratio between 0.2 (20%) and 0.8 (80%) |
| `--workers <num>` | `2` | Number of parallel worker threads |
| `--dry-run` | `false` | Preview operations without processing |
| `--overwrite` | `false` | Overwrite existing output files |
| `--no-recursive` | `false` | Don't scan subdirectories for videos |
| `--help`, `-h` | — | Show help message |
| `--version`, `-v` | — | Show version number |

### Examples

**Basic processing (default 50% split, 2 workers):**
```bash
node index.js --input ./videos --output ./output
```

**Custom split point and more workers:**
```bash
node index.js --input ./videos --output ./output --split 0.4 --workers 4
```

**Preview without processing:**
```bash
node index.js --input ./videos --output ./output --dry-run
```

**Don't recurse into subdirectories:**
```bash
node index.js --input ./videos --output ./output --no-recursive
```

**Overwrite existing files:**
```bash
node index.js --input ./videos --output ./output --overwrite
```

**Aggressive split (80% of video before dissolve):**
```bash
node index.js --input ./videos --output ./output --split 0.8
```

## How It Works

### Visual Explanation

```
Original Video:
[-------- 50% Part A --------|-------- 50% Part B --------]

After Processing:
[-------- Part B --------][~DISSOLVE~][-------- Part A --------]
                          ↑
                    Seamless blend point
```

### Algorithm

1. **Detect metadata**: Uses `ffprobe` to get exact video duration and audio presence
2. **Calculate split point**: Default 50%, customizable via `--split` (20%–80%)
3. **Calculate dissolve**: Based on video length:
   - ≤ 5s: **0.4s** dissolve
   - 5s–30s: **0.8s** dissolve
   - \> 30s: **1.2s** dissolve
   - Never exceeds 20% of each part duration
4. **Build loops**: Uses FFmpeg's `xfade` filter for video and `acrossfade` for audio
5. **Output**: Encodes with libx264 (H.264) at fast preset, CRF 23

### FFmpeg Command (for reference)

```bash
ffmpeg -i input.mp4 -i input.mp4 \
  -filter_complex "
    [0:v]trim=start=<splitPoint>:end=<duration>,setpts=PTS-STARTPTS[b];
    [0:v]trim=start=0:end=<splitPoint>,setpts=PTS-STARTPTS[a];
    [b][a]xfade=transition=dissolve:duration=<dissolveDur>:offset=<offset>[v];
    [0:a]atrim=start=<splitPoint>:end=<duration>,asetpts=PTS-STARTPTS[b_audio];
    [0:a]atrim=start=0:end=<splitPoint>,asetpts=PTS-STARTPTS[a_audio];
    [b_audio][a_audio]acrossfade=d=<dissolveDur>[a]
  " \
  -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 output.mp4
```

## Examples

### Example 1: Simple Directory Processing

```bash
$ node index.js --input ./my-videos --output ./looped-videos

🎬 video-loop-splitter v1.0.0

Found 3 video file(s)

Options:
  Input:     ./my-videos
  Output:    ./looped-videos
  Split:     50%
  Workers:   2
  Mode:      PROCESSING

✅ intro.mp4
   Duration: 15.50s | Split: 7.75s | Dissolve: 0.80s | Audio: yes
✅ nature-walk.mov
   Duration: 42.30s | Split: 21.15s | Dissolve: 1.20s | Audio: no
✅ background-music.webm
   Duration: 8.20s | Split: 4.10s | Dissolve: 0.40s | Audio: yes

==================================================
Completed: 3 | Skipped: 0 | Errors: 0 | Dry-runs: 0
Total time: 145.23s
==================================================
```

### Example 2: Dry-Run with Custom Split

```bash
$ node index.js --input ./videos --split 0.3 --dry-run

# Shows what would happen without processing
🔍 video1.mp4 (DRY RUN)
   Duration: 60.00s | Split: 18.00s | Dissolve: 1.20s | Audio: yes
```

### Example 3: Parallel Processing with 4 Workers

```bash
$ node index.js --input ./videos --output ./output --workers 4

# Processes 4 videos simultaneously for faster batch conversion
```

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **Windows** (CMD) | ✅ | Fully supported; handles spaces in paths |
| **Windows** (PowerShell) | ✅ | Fully supported |
| **macOS** | ✅ | Fully supported; uses Homebrew ffmpeg |
| **Linux** | ✅ | Fully supported; any distribution |

## Output Naming

Video files are processed with the suffix `_loop`:
- `video.mp4` → `video_loop.mp4`
- `intro.mov` → `intro_loop.mov`
- `nature.webm` → `nature_loop.webm`

Output directory structure mirrors the input structure (with `--no-recursive` disabled).

## Supported Video Formats

- `.mp4` (H.264/H.265)
- `.mov` (QuickTime)
- `.mkv` (Matroska)
- `.avi` (Audio Video Interleave)
- `.webm` (WebM)

*Other formats supported by FFmpeg may work but are not officially tested.*

## Troubleshooting

### Error: `ffmpeg not found`
Ensure FFmpeg is installed and in your system PATH. Test with:
```bash
ffmpeg -version
ffprobe -version
```

### Slow processing
Increase worker count:
```bash
node index.js --input ./videos --workers 8
```

### Output files have visible seams
This is normal for certain video content. Try different split ratios:
```bash
node index.js --input ./videos --split 0.4  # Instead of 0.5
```

### Audio sync issues
Ensure your videos are properly encoded. Re-encode the source with FFmpeg first:
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium output.mp4
```

## Performance Metrics

Processing times vary based on:
- Video resolution (1080p vs 4K)
- Video duration
- CPU cores available
- Worker count and system load

**Typical performance** (4-core machine, 1080p, 30s video, 2 workers):
- ~20–40 seconds per video

Increase `--workers` for faster processing on multi-core systems:
```bash
node index.js --input ./videos --workers $(nproc)  # Linux/macOS
node index.js --input ./videos --workers 8         # Windows
```

## Development

Clone the repository and test locally:

```bash
git clone https://github.com/your-username/video-loop-splitter.git
cd video-loop-splitter

# Test on a sample video
node index.js --input ./test-videos --output ./test-output --dry-run

# Run with actual processing
node index.js --input ./test-videos --output ./test-output
```

## License

MIT © 2026 — video-loop-splitter

See [LICENSE](LICENSE) for full text.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**Made with ❤️ for video creators and seamless loop enthusiasts.**
