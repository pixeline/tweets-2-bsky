# tweets-2-bsky

Cross-post from Twitter/X to Bluesky with thread support, media handling, account mapping, and a web dashboard.

This repo is also mirrored on Tangled: [j4ck.xyz/tweets2bsky](https://tangled.org/j4ck.xyz/tweets2bsky)

## How It Works (Simple)

1. You connect one or more Twitter/X source accounts to a Bluesky account.
2. The app reads tweets from X using `@the-convocation/twitter-scraper` with your cookies (`auth_token` + `ct0`).
3. It posts to Bluesky using the official AT Protocol client (`@atproto/api`).
4. It tracks what was already posted in SQLite so it does not repost duplicates.
5. A scheduler runs automatically, and you can also trigger `Run now` from the dashboard or CLI.

## Installation (Pick One Path)

Use either:

- Docker (recommended)
- Source install (PM2 or manual runtime)

Do not do both on the same machine unless you intentionally want two separate deployments.

### Option A: Docker (Recommended)

Prerequisite: Docker Desktop (macOS/Windows) or Docker Engine (Linux).

Start with the included compose file:

```bash
docker compose up -d
```

Open `http://localhost:3000`.

If you prefer `docker run`:

```bash
docker run -d \
  --name tweets-2-bsky \
  -p 3000:3000 \
  -v tweets2bsky_data:/app/data \
  --restart unless-stopped \
  j4ckxyz/tweets-2-bsky:latest
```

Important: keep a persistent volume (`-v tweets2bsky_data:/app/data`) so mappings/history survive container recreation.

Useful Docker commands:

```bash
docker logs -f tweets-2-bsky
docker exec -it tweets-2-bsky bun dist/cli.js status
docker stop tweets-2-bsky
docker start tweets-2-bsky
```

Update Docker deployment:

```bash
docker pull j4ckxyz/tweets-2-bsky:latest
docker stop tweets-2-bsky
docker rm tweets-2-bsky
docker run -d \
  --name tweets-2-bsky \
  -p 3000:3000 \
  -v tweets2bsky_data:/app/data \
  --restart unless-stopped \
  j4ckxyz/tweets-2-bsky:latest
```

Alternative image: `ghcr.io/j4ckxyz/tweets-2-bsky:latest`.

### Option B: Source Install (PM2 or Manual)

Prerequisites:

- `git`
- Bun 1.x+ (the installer auto-installs/upgrades Bun when needed)
- PM2 (optional, but recommended for background runtime)

Clone and install:

```bash
git clone https://github.com/j4ckxyz/tweets-2-bsky
cd tweets-2-bsky
chmod +x install.sh
./install.sh
```

`install.sh` does install/build/start and uses:

- PM2 when PM2 is available
- `nohup` when PM2 is not installed

Useful installer commands:

```bash
./install.sh --status
./install.sh --stop
./install.sh --start-only
./install.sh --no-start
./install.sh --port 3100
```

#### PM2 Manual Runtime (if you want direct PM2 control)

```bash
bun install
bun run build
pm2 start "$HOME/.bun/bin/bun" --name tweets-2-bsky --cwd "$PWD" -- dist/index.js
pm2 logs tweets-2-bsky
pm2 save
```

#### Manual Foreground Runtime (no PM2)

```bash
bun install
bun run build
bun run start
```

#### Manual Nohup Runtime (no PM2)

```bash
mkdir -p data/runtime
nohup bun run start > data/runtime/tweets-2-bsky.log 2>&1 &
echo $! > data/runtime/tweets-2-bsky.pid
```

Stop nohup process:

```bash
kill "$(cat data/runtime/tweets-2-bsky.pid)"
```

## First-Time Setup (After Install)

1. Open `http://localhost:3000`.
2. Register the first user (this account becomes admin).
3. In Settings, add Twitter cookies (`auth_token`, `ct0`; backup pair optional).
4. Add a mapping (Twitter source usernames -> Bluesky account).
5. Click `Run now`.

## Twitter/X Integration Notes

- This project does not use Twitter's paid official API.
- It uses `@the-convocation/twitter-scraper` and authenticated browser cookies to read account/tweet data.
- Required cookies: `auth_token` and `ct0`.
- If cookies expire, update them in Settings.
- Keep cookies private; they are sensitive credentials.

For some quote-tweet screenshot fallbacks, Chromium is used (bundled in Docker, optional dependency for source installs).

## CLI Quick Commands

Always run CLI commands as:

```bash
bun run cli -- <command>
```

Common commands:

```bash
bun run cli -- status
bun run cli -- list
bun run cli -- run-now
bun run cli -- run-now --dry-run
bun run cli -- add-mapping
bun run cli -- backfill <mapping-id-or-handle> --limit 50
```

## Updating

Source installs:

```bash
./update.sh
```

Useful flags:

```bash
./update.sh --no-restart
./update.sh --skip-install --skip-build
```

## Data and Security

Important files:

- `config.json` (mappings, credentials, users)
- `data/database.sqlite` (processed history)
- `data/.jwt-secret` (generated signing key when `JWT_SECRET` is unset)
- `.env` (runtime env values)

Security basics:

- First registered user becomes admin.
- Prefer Bluesky app passwords instead of your full Bluesky password.
- Set an explicit `JWT_SECRET` in `.env` for predictable secret management.
- Keep `config.json`, cookie values, and `.env` private.

## Development

```bash
bun run dev
bun run dev:web
bun run build
bun run typecheck
bun run lint
```

## Troubleshooting

See `TROUBLESHOOTING.md`.

Common native module recovery:

```bash
bun run rebuild:native
bun run build
bun run start
```

## License

MIT
