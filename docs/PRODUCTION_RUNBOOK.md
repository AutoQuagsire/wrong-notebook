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

export NODE_OPTIONS="--max-old-space-size=1024"
export NEXT_TELEMETRY_DISABLED=1
npx next build --webpack

pm2 restart wrong-notebook
pm2 status

curl -I http://127.0.0.1:3000
curl -I http://8.148.71.66
```

**Important**: Always use `npx next build --webpack` on the 2GB VPS.
Never use Turbopack build (default `npm run build`) on the server.

## Deploy With Prisma Migration

Only when `prisma/migrations/` has new migration files:

```bash
/opt/wrong-notebook/backup.sh

cd /var/www/wrong-notebook
git pull --ff-only origin main
npm ci
npx prisma generate
npx prisma migrate deploy
npx next build --webpack
pm2 restart wrong-notebook
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
