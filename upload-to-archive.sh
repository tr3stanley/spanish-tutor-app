#!/bin/bash

# Upload to Archive.org in batches
# First configure: ia configure

COLLECTION_NAME="storylearning-spanish-podcast"
BATCH_SIZE=50
TOTAL_FILES=$(ls podcast-downloads/*.mp3 2>/dev/null | wc -l | tr -d ' ')

if [ "$TOTAL_FILES" -eq 0 ]; then
    echo "No MP3 files found in podcast-downloads/"
    exit 1
fi

echo "Found $TOTAL_FILES files to upload"
echo "Collection name: $COLLECTION_NAME"
echo ""

# First, check the actual format of files
echo "Checking file formats..."
file podcast-downloads/001-*.mp3 | head -1

echo ""
echo "Choose upload method:"
echo "1. Upload all at once (7GB)"
echo "2. Upload in batches of $BATCH_SIZE"
echo "3. Upload first 10 as test"
echo "4. Check file format and convert if needed"
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "Uploading all files to $COLLECTION_NAME..."
        ia upload "$COLLECTION_NAME" podcast-downloads/*.mp3 \
            --metadata="title:StoryLearning Spanish Complete Podcast Series" \
            --metadata="creator:StoryLearning" \
            --metadata="mediatype:audio" \
            --metadata="collection:opensource_audio" \
            --metadata="language:Spanish" \
            --metadata="subject:podcast" \
            --metadata="subject:spanish" \
            --metadata="subject:language learning" \
            --metadata="subject:intermediate spanish" \
            --metadata="description:Complete collection of 725 episodes from StoryLearning Spanish podcast. Intermediate level Spanish stories for language learners." \
            --retries 10
        ;;

    2)
        echo "Uploading in batches of $BATCH_SIZE..."
        counter=0
        batch=1

        for file in podcast-downloads/*.mp3; do
            if [ $counter -eq 0 ]; then
                echo ""
                echo "Starting batch $batch (files $((($batch-1)*$BATCH_SIZE+1)) to $(($batch*$BATCH_SIZE)))"
                batch_files=""
            fi

            batch_files="$batch_files $file"
            counter=$((counter + 1))

            if [ $counter -eq $BATCH_SIZE ]; then
                echo "Uploading batch $batch..."
                ia upload "$COLLECTION_NAME-batch$batch" $batch_files \
                    --metadata="title:StoryLearning Spanish Podcast - Batch $batch" \
                    --metadata="mediatype:audio" \
                    --metadata="language:Spanish" \
                    --metadata="subject:podcast;spanish;language learning" \
                    --retries 10

                counter=0
                batch=$((batch + 1))
                sleep 5  # Brief pause between batches
            fi
        done

        # Upload remaining files
        if [ $counter -gt 0 ]; then
            echo "Uploading final batch..."
            ia upload "$COLLECTION_NAME-batch$batch" $batch_files \
                --metadata="title:StoryLearning Spanish Podcast - Final Batch" \
                --metadata="mediatype:audio" \
                --metadata="language:Spanish" \
                --metadata="subject:podcast;spanish;language learning" \
                --retries 10
        fi
        ;;

    3)
        echo "Uploading first 10 files as test..."
        test_files=$(ls podcast-downloads/*.mp3 | head -10)
        ia upload "$COLLECTION_NAME-test" $test_files \
            --metadata="title:StoryLearning Spanish Test Upload" \
            --metadata="mediatype:audio" \
            --metadata="language:Spanish" \
            --metadata="subject:podcast;spanish;language learning;test" \
            --retries 5
        ;;

    4)
        echo "Checking and converting files if needed..."
        echo ""
        echo "Sample file analysis:"
        file podcast-downloads/001-*.mp3

        echo ""
        echo "If files are M4A/AAC, run this to convert:"
        echo "for file in podcast-downloads/*.mp3; do"
        echo "  ffmpeg -i \"\$file\" -acodec mp3 -ab 128k \"\${file%.mp3}-converted.mp3\""
        echo "done"
        ;;
esac

echo ""
echo "After upload completes:"
echo "1. Go to https://archive.org/details/$COLLECTION_NAME"
echo "2. Copy the URL"
echo "3. Import to your Spanish Tutor app"