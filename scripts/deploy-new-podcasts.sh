#!/bin/bash

# Script to deploy new podcasts to production
# Usage: ./scripts/deploy-new-podcasts.sh

set -e

REPO_OWNER="tr3stanley"
REPO_NAME="spanish-tutor-app"
UPLOADS_DIR="./uploads"
DB_PATH="./data/podcasts.db"

echo "🎙️  Deploying new podcasts to production..."

# Check if there are new audio files
NEW_FILES=$(find $UPLOADS_DIR -name "*.mp3" -newer $DB_PATH 2>/dev/null || true)

if [ -z "$NEW_FILES" ]; then
    echo "ℹ️  No new audio files found. Exiting."
    exit 0
fi

echo "📁 Found new audio files:"
echo "$NEW_FILES"

# Get or create release tag
RELEASE_TAG="audio-files-$(date +%Y-%m-%d)"
echo "🏷️  Using release tag: $RELEASE_TAG"

# Check if release exists, create if not
if ! gh release view $RELEASE_TAG >/dev/null 2>&1; then
    echo "🆕 Creating new release: $RELEASE_TAG"
    gh release create $RELEASE_TAG --title "Audio Files - $(date +%m/%d/%Y)" --notes "Audio files for podcast episodes"
fi

# Upload new audio files
echo "📤 Uploading audio files to GitHub Releases..."
for file in $NEW_FILES; do
    filename=$(basename "$file")
    echo "   Uploading: $filename"
    gh release upload $RELEASE_TAG "$file"

    # Update database with GitHub URL
    github_url="https://github.com/$REPO_OWNER/$REPO_NAME/releases/download/$RELEASE_TAG/$filename"
    echo "   Updating database with URL: $github_url"
    sqlite3 $DB_PATH "UPDATE podcasts SET file_path = '$github_url' WHERE filename = '$filename';"
done

# Commit and push database changes
echo "💾 Committing database changes..."
git add -f $DB_PATH
git commit -m "Add new podcasts to production

$(echo "$NEW_FILES" | sed 's|./uploads/||g' | sed 's|^|- |g')

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo "🚀 Pushing to GitHub (triggers Vercel deployment)..."
git push

echo "✅ Done! New podcasts will be live on Vercel in ~2 minutes."
echo "🌐 Check: https://spanish-tutor-app.vercel.app"