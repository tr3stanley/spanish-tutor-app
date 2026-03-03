#!/usr/bin/env python3
"""
RSS Podcast Downloader - Simple and Reliable
Downloads all episodes from a podcast RSS feed
"""

import os
import sys
import requests
from xml.etree import ElementTree
from urllib.parse import urlparse
import re

def clean_filename(title):
    """Clean title for use as filename"""
    # Remove invalid characters
    title = re.sub(r'[<>:"/\\|?*]', '-', title)
    # Limit length
    title = title[:100]
    # Remove extra spaces and dashes
    title = re.sub(r'[-\s]+', '-', title)
    return title.strip('-')

def download_podcast(rss_url, output_dir='podcast-downloads'):
    """Download all episodes from RSS feed"""

    print(f"Fetching RSS feed: {rss_url}")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Fetch RSS feed
        response = requests.get(rss_url, timeout=30)
        response.raise_for_status()

        # Parse XML
        root = ElementTree.fromstring(response.content)

        # Get podcast title
        channel = root.find('.//channel')
        podcast_title = channel.find('title').text if channel.find('title') is not None else 'Unknown Podcast'

        print(f"Podcast: {podcast_title}")

        # Find all episodes
        items = root.findall('.//item')
        print(f"Found {len(items)} episodes")

        if not items:
            print("No episodes found in RSS feed")
            return

        # REVERSE to start from oldest episodes first
        items = list(reversed(items))
        print(f"Starting from oldest episode first\n")

        # Download each episode
        downloaded = 0
        failed = 0

        for i, item in enumerate(items, 1):
            # Get episode info
            title_elem = item.find('title')
            title = title_elem.text if title_elem is not None else f'Episode {i}'

            # Find audio URL (in enclosure tag)
            enclosure = item.find('enclosure')
            if enclosure is None:
                print(f"Skipping {i}. {title} - no audio found")
                continue

            audio_url = enclosure.get('url')
            if not audio_url:
                print(f"Skipping {i}. {title} - no URL in enclosure")
                continue

            # Clean filename
            clean_title = clean_filename(title)
            filename = f"{i:03d}-{clean_title}.mp3"
            filepath = os.path.join(output_dir, filename)

            # Skip if already exists
            if os.path.exists(filepath):
                file_size = os.path.getsize(filepath)
                if file_size > 1000000:  # If file is > 1MB, assume it's complete
                    print(f"✓ Already exists: {filename}")
                    downloaded += 1
                    continue

            # Download episode
            print(f"Downloading {i}/{len(items)}: {title}")
            print(f"  URL: {audio_url}")

            try:
                # Download with streaming
                audio_response = requests.get(audio_url, stream=True, timeout=60)
                audio_response.raise_for_status()

                # Get total size if available
                total_size = int(audio_response.headers.get('content-length', 0))

                # Write to file
                downloaded_size = 0
                with open(filepath, 'wb') as f:
                    for chunk in audio_response.iter_content(chunk_size=1024*1024):  # 1MB chunks
                        if chunk:
                            f.write(chunk)
                            downloaded_size += len(chunk)

                            # Show progress
                            if total_size > 0:
                                progress = (downloaded_size / total_size) * 100
                                print(f"  Progress: {progress:.1f}%", end='\r')

                print(f"  ✓ Saved: {filename} ({downloaded_size / 1024 / 1024:.1f} MB)")
                downloaded += 1

            except Exception as e:
                print(f"  ✗ Failed: {str(e)}")
                failed += 1
                # Remove partial file
                if os.path.exists(filepath):
                    os.remove(filepath)

        # Summary
        print(f"\n{'='*50}")
        print(f"Download complete!")
        print(f"  Successfully downloaded: {downloaded} episodes")
        if failed > 0:
            print(f"  Failed: {failed} episodes")
        print(f"  Saved to: {os.path.abspath(output_dir)}/")

    except Exception as e:
        print(f"Error fetching RSS feed: {e}")
        return

def main():
    # Default RSS URL (can be overridden by command line argument)
    rss_url = "https://anchor.fm/s/2ce7d1b0/podcast/rss"

    # Check for command line argument
    if len(sys.argv) > 1:
        rss_url = sys.argv[1]

    # Print header
    print("RSS Podcast Downloader")
    print("=" * 50)
    print(f"RSS URL: {rss_url}")

    # If running interactively, allow URL change
    if sys.stdin.isatty():
        print("\nPress Enter to use this URL, or type a different RSS URL:")
        try:
            user_input = input().strip()
            if user_input:
                rss_url = user_input
        except (EOFError, KeyboardInterrupt):
            pass

    # Download the podcast
    download_podcast(rss_url)

    print("\nNext steps:")
    print("1. Upload these files to Archive.org for free hosting")
    print("2. Import the Archive.org collection to your Spanish Tutor app")
    print("3. Process with Whisper and deploy")

if __name__ == "__main__":
    main()