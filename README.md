# Tweets-2-Bsky

Crosspost Tweets/X posts to Bluesky with support for threads, media, and multiple account mappings.

## Features

- Automated crossposting from Twitter/X to Bluesky
- Thread-aware posting
- Video/GIF and high-quality image handling
- Multi-source account mappings per Bluesky target
- React + Vite web dashboard (auto light/dark mode)
- Native-styled "Already Posted" feed in dashboard
- Full CLI workflows for CLI-only/cronjob usage

## Requirements

- Node.js 22+
- npm
- Git

## Fast Setup (Web + CLI)

```bash
git clone https://github.com/j4ckxyz/tweets-2-bsky
cd tweets-2-bsky
npm install
npm run build
npm start
```

Open: [http://localhost:3000](http://localhost:3000)

Notes:
- `npm install` automatically rebuilds native modules (including `better-sqlite3`) for your active Node version.
- If you switch Node versions later, run `npm run rebuild:native`.

## CLI-Only Setup

1. Configure Twitter cookies:
   ```bash
   npm run cli -- setup-twitter
   ```
2. Add mapping(s):
   ```bash
   npm run cli -- add-mapping
   ```
3. Run one sync cycle now:
   ```bash
   npm run cli -- run-now
   ```

## Updating

Use:

```bash
./update.sh
```

What it does:
- pulls latest code
- installs dependencies
- rebuilds native modules
- builds server + web UI
- restarts PM2 process (if PM2 is installed)
- preserves local `config.json` via backup/restore

## CLI Commands (Feature Parity)

Always use:

```bash
npm run cli -- <command>
```

Core commands:
- `setup-twitter`: Configure primary + backup Twitter cookies
- `setup-ai`: Configure AI provider/API settings
- `add-mapping`, `edit-mapping`, `remove`, `list`
- `set-interval <minutes>`: Scheduler interval
- `run-now [--dry-run] [--web]`: Run one cycle immediately (good for cron)
- `backfill [mapping] --limit 15 [--dry-run] [--web]`
- `import-history [mapping] --limit 15 [--dry-run] [--web]`
- `clear-cache [mapping]`
- `delete-all-posts [mapping]`
- `recent-activity --limit 20`
- `config-export [file]`
- `config-import <file>`
- `status`

Mapping arguments can be mapping ID, Bluesky handle, or Twitter username.

## Cronjob Example

Run every 5 minutes:

```cron
*/5 * * * * cd /path/to/tweets-2-bsky && /usr/bin/npm run cli -- run-now >> /tmp/tweets-2-bsky.log 2>&1
```

Backfill specific mapping once:

```bash
npm run cli -- backfill <mapping-id-or-handle> --limit 50
```

## Web Dashboard

1. Register first user (becomes admin)
2. Configure Twitter + AI settings
3. Add mappings
4. Use:
   - `Run now`
   - backfill/reset actions per mapping
   - config export/import
   - "Already Posted" feed for native-themed post browsing

## Configuration & Security

### Environment variables

Create `.env` (recommended):

```env
PORT=3000
JWT_SECRET=your-super-secret-key-change-this
```

If `JWT_SECRET` is not set, a fallback secret is used.

### Local data files

- `config.json`: mappings + auth settings + web users (do not share)
- `data/database.sqlite`: processed tweet history

## Troubleshooting

See: `TROUBLESHOOTING.md`

Most common fix after changing Node versions:

```bash
npm run rebuild:native
npm run build
npm start
```

## License

MIT
