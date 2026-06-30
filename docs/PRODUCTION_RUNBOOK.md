# Production Runbook

## Current Production Deployment

- Public URL: `http://8.148.71.66`
- Server path: `/var/www/wrong-notebook`
- PM2 app: `wrong-notebook`
- Database: `/var/www/wrong-notebook/prisma/production.db`
- Backup directory: `/var/backups/wrong-notebook`
- Backup script: `/opt/wrong-notebook/backup.sh`
- Restore guide on server: `/opt/wrong-notebook/RESTORE.md`
- Nginx config: `/etc/nginx/sites-available/wrong-notebook`
- **Next.js mode**: `output: 'standalone'` — `next start` is **not supported**. Must use `node .next/standalone/server.js`.

## Production DATABASE_URL

**Must be absolute path.** Relative paths break under standalone mode because the Node process chdirs to `.next/standalone/`.

```
DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"
```

This must be set in:
1. Root `.env` (used by build)
2. `.next/standalone/.env` (consumed by standalone server at runtime — build writes a stale copy, must be patched after every build)
3. PM2 process env (`pm2 env <id>`)

**Forbidden** values:
- `file:./production.db`
- `file:./prisma/production.db`
- Any relative `file:` path

## Production Version

Initial production-ready checkpoint:

```text
checkpoint-review-system-main-v1.5.10
commit e9f5afc
```

## Daily Checks

Run on production server:

```bash
pm2 status
systemctl status nginx --no-pager
ls -lh /var/backups/wrong-notebook | tail -10
tail -n 80 /var/log/wrong-notebook-backup.log
```

## Manual Backup

```bash
/opt/wrong-notebook/backup.sh
```

Backups are also run automatically at 03:30 daily.
Retention: 30 days.

## Deploy Code Update (no DB change)

```bash
/opt/wrong-notebook/backup.sh

cd /var/www/wrong-notebook
git status --short
git fetch --all --tags
git pull --ff-only origin main

npx prisma generate
rm -rf .next

export NODE_ENV=production
export DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"
export NODE_OPTIONS="--max-old-space-size=768"
export NEXT_TELEMETRY_DISABLED=1
npx next build --webpack

# CRITICAL: standalone .env inherits DATABASE_URL from build-time env;
# verify and force-rewrite if build didn't pick up the absolute path
if [ -f .next/standalone/.env ]; then
    sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"|' .next/standalone/.env
fi
grep '^DATABASE_URL=' .next/standalone/.env

# CRITICAL: standalone does NOT auto-copy .next/static or public.
# Missing static assets cause ChunkLoadError / _next/static 404 / KaTeX font 404.
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -a .next/static .next/standalone/.next/static

rm -rf .next/standalone/public
if [ -d public ]; then
    cp -a public .next/standalone/public
fi

# Start with standalone server, NOT next start
DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db" \
NODE_ENV=production \
PORT=3000 \
HOSTNAME=127.0.0.1 \
pm2 restart wrong-notebook --update-env

pm2 save
pm2 status

curl -I http://127.0.0.1:3000
curl -I http://8.148.71.66
```

**Important**: Always use `npx next build --webpack` on the 2GB VPS.
Never use Turbopack build (default `npm run build`) on the server.
**Never use `next start`** — this project is `output: 'standalone'`.
Always verify `DATABASE_URL` is absolute after build.
Always verify `.next/standalone/.next/static` exists after build (missing → ChunkLoadError).

## Deploy With Prisma Migration

Only when `prisma/migrations/` has new migration files:

```bash
/opt/wrong-notebook/backup.sh

cd /var/www/wrong-notebook
git pull --ff-only origin main
npm ci
npx prisma generate
npx prisma migrate deploy

export NODE_ENV=production
export DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"
export NODE_OPTIONS="--max-old-space-size=768"
npx next build --webpack

# Fix standalone .env DATABASE_URL
if [ -f .next/standalone/.env ]; then
    sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"|' .next/standalone/.env
fi

# Fix standalone static assets
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -a .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
[ -d public ] && cp -a public .next/standalone/public

DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db" \
NODE_ENV=production \
PORT=3000 \
HOSTNAME=127.0.0.1 \
pm2 restart wrong-notebook --update-env

pm2 save
```

**Never** run `npx prisma migrate reset` in production.

## Rollback Concept

If a deployment fails:

1. Do not delete production.db.
2. Check PM2 logs: `pm2 logs wrong-notebook --lines 120`
3. Checkout previous known-good Git tag.
4. Rebuild with webpack.
5. Restart PM2.
6. If database restore is required, follow `/opt/wrong-notebook/RESTORE.md`.

## Smoke Test Checklist

After every production deployment:

- [ ] Open `http://8.148.71.66` — login page loads
- [ ] Login — successful
- [ ] Open error list — loads existing data
- [ ] Open error detail — shows content
- [ ] Open today review — loads correctly
- [ ] Create small test error — works
- [ ] Delete test error (if applicable)

Log check:

```bash
pm2 logs wrong-notebook --lines 120
tail -n 80 /var/log/nginx/error.log
```

## Important Rules

- Never overwrite production.db with local dev.db.
- Never commit `.env` or expose API keys.
- Never run destructive Prisma commands in production.
- Always back up before deployment.
- Use webpack build on the 2GB VPS, not Turbopack.
- **Never use `next start`** — this is `output: 'standalone'`. Use `node .next/standalone/server.js`.
- **DATABASE_URL must be absolute** (`file:/var/www/wrong-notebook/prisma/production.db`). Relative paths break standalone.
- **After every build, verify** `.next/standalone/.env` has the correct absolute DATABASE_URL.
- If `/var/www/wrong-notebook/production.db` exists as an empty/stale file, it was created by misconfigured relative path. Do not delete it without confirming the real DB is in use and backing up first.
