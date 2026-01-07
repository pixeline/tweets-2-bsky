#!/bin/bash
echo "🔧 Repairing PM2 Process Environment..."

PROCESS_NAME="tweets-2-bsky"
if pm2 describe twitter-mirror &> /dev/null; then
    PROCESS_NAME="twitter-mirror"
fi

echo "Found process: $PROCESS_NAME"
echo "Deleting process..."
pm2 delete $PROCESS_NAME

echo "Starting process with fresh environment..."
pm2 start dist/index.js --name $PROCESS_NAME

echo "Saving PM2 list..."
pm2 save

echo "✅ Repair complete! The MODULE_NOT_FOUND error should be gone."
