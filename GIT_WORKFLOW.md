# Git Workflow Guide for Firefox-Oasis Development

## Current Setup
- **Main Branch**: `main` (production/stable code)
- **Development Branch**: `development` (for feature development)

## Daily Development Workflow

### 1. Starting Work on a Feature
```bash
# Make sure you're on the development branch
git checkout development

# Pull latest changes from remote
git pull origin development

# Create a feature branch for your specific feature
git checkout -b feature/your-feature-name
```

### 2. Making Changes
- Make your code changes
- Test locally with `./mach build` and `./mach run`
- Commit frequently with descriptive messages

### 3. Committing Changes
```bash
# Stage your changes (only commit source files, not node_modules)
git add browser/base/content/assistant/
git add browser/base/jar.mn
git add browser/locales/
git add browser/branding/custom/
# etc. - add only the files you modified

# Commit with a descriptive message
git commit -m "Add feature: description of what you did"
```

### 4. Pushing to Remote
```bash
# Push your feature branch to GitHub
git push origin feature/your-feature-name
```

### 5. Merging to Development Branch
```bash
# Switch to development branch
git checkout development

# Merge your feature branch
git merge feature/your-feature-name

# Push to remote
git push origin development
```

### 6. Merging Development to Main (When Ready)
```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge development into main
git merge development

# Push to remote
git push origin main
```

## Important Notes

### Files to NOT Commit
- `node_modules/` - These are dependencies, should be in .gitignore
- `obj-x86_64-pc-windows-msvc/` - Build artifacts
- `tempfx-profile/` - Temporary profiles
- `*.log` files
- Build outputs

### Files to Commit
- Source code files (`.ts`, `.js`, `.xhtml`, `.ftl`, etc.)
- Configuration files (`.json`, `.toml`, etc.)
- Build configuration (`.moz.build`, `jar.mn`, etc.)
- Documentation (`.md` files)

## Quick Reference Commands

```bash
# Check current branch
git branch --show-current

# See what files changed
git status

# See detailed changes
git diff

# Switch branches
git checkout branch-name

# Create and switch to new branch
git checkout -b new-branch-name

# View commit history
git log --oneline

# Undo uncommitted changes
git checkout -- filename

# Stash changes (save for later)
git stash
git stash pop  # restore later
```

