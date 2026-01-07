# tweets-2-bsky

A powerful tool to crosspost Tweets to Bluesky, supporting threads, videos, and high-quality images.

## Troubleshooting

### Update Failures / Git Conflicts
If `./update.sh` fails with "Pulling is not possible because you have unmerged files" or similar git errors:

1. Reset your local repository to match the remote (Warning: this discards local changes to tracked files):
   ```bash
   git reset --hard origin/master
   ```
2. Run the update script again:
   ```bash
   ./update.sh
   ```

### PM2 "MODULE_NOT_FOUND" Error
If you see errors about `npm` not being found in the logs after an update:

1. Run the repair script:
   ```bash
   chmod +x repair_pm2.sh
   ./repair_pm2.sh
   ```
