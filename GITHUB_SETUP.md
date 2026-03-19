# GitHub Repository Setup Instructions

The local Git repository has been successfully initialized and the initial commit has been created.

## Option 1: Using GitHub CLI (Recommended)

1. **Install GitHub CLI**
   - Windows: https://cli.github.com
   - Or via: `choco install gh` (if Chocolatey is installed)
   - Or via: `winget install GitHub.cli`

2. **Authenticate with GitHub**
   ```bash
   gh auth login
   # Follow the prompts to authenticate
   ```

3. **Create the repository on GitHub**
   ```bash
   cd "e:\ADA Dropbox\ADA (1)\2026\video-loop-splitter"
   gh repo create video-loop-splitter --public --source=. --remote=origin --push
   ```

4. **Add topics to the repository**
   ```bash
   gh repo edit video-loop-splitter --add-topic ffmpeg,video,cli,nodejs,loop,seamless-loop,windows
   ```

## Option 2: Manual Setup via GitHub Web Interface

1. **Create the repository on GitHub**
   - Go to https://github.com/new
   - Repository name: `video-loop-splitter`
   - Description: "CLI tool to create seamless looping videos using ffmpeg"
   - Public repository
   - Click "Create repository"

2. **Connect your local repository**
   ```bash
   cd "e:\ADA Dropbox\ADA (1)\2026\video-loop-splitter"
   git remote add origin https://github.com/YOUR_USERNAME/video-loop-splitter.git
   git branch -M main
   git push -u origin main
   ```

3. **Add topics (optional)**
   - Go to your repository page
   - Click "Add topics" on the right sidebar
   - Add: `ffmpeg`, `video`, `cli`, `nodejs`, `loop`, `seamless-loop`, `windows`

## Updating package.json

After creating the GitHub repository, update `package.json` with your actual username:

Replace:
```json
"author": "Your Name",
"repository": {
  "type": "git",
  "url": "https://github.com/your-username/video-loop-splitter.git"
},
"homepage": "https://github.com/your-username/video-loop-splitter",
"bugs": {
  "url": "https://github.com/your-username/video-loop-splitter/issues"
}
```

With your actual GitHub username and name.

---

Once the repository is created and pushed, the project is ready for use:

```bash
npm install -g video-loop-splitter
# or
node index.js --input ./videos --output ./output
```
