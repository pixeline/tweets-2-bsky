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

### `better-sqlite3` NODE_MODULE_VERSION mismatch
If startup fails with `ERR_DLOPEN_FAILED` and a `NODE_MODULE_VERSION` mismatch:

1. Rebuild native bindings for your active Node version:
   ```bash
   npm run rebuild:native
   ```
2. Rebuild and start:
   ```bash
   npm run build
   npm start
   ```

### Dashboard appears unstyled / plain text UI
If the app loads but looks mostly unstyled:

1. Rebuild web assets:
   ```bash
   npm run build
   ```
2. Restart server:
   ```bash
   npm start
   ```
3. Hard refresh browser cache (`Cmd+Shift+R` on macOS).

### CLI command not recognized
When using npm scripts, pass CLI args after `--`:

```bash
npm run cli -- status
```
