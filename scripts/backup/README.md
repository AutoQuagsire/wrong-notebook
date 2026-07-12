# No-image backup generator

This directory adds a **separate** backup flow for generating a distributable backup package that excludes all image data.

It does **not** replace the existing full-server backup flow, and it does **not** modify or delete any current full backups.

## Scope

- Generates a SQLite source snapshot using `sqlite3 .backup`
- Sanitizes only the temporary snapshot
- Produces a fresh no-image database via `VACUUM INTO`
- Validates SQLite integrity, foreign keys, row counts, schema shape, and forbidden image signatures
- Produces:
  - a final archive
  - an archive SHA-256 sidecar
  - an in-archive `SHA256SUMS`
  - a `manifest.json`

## Images excluded

The final distributed database must exclude the confirmed persistent image fields:

- `ErrorItem.originalImageUrl` → `''`
- `PracticeRecord.answerImageUrl` → `NULL`

The final package must **never** include:

- the original source database
- the temporary source snapshot
- WAL / SHM files
- `uploads/`
- `.env`
- SQL dumps

## Recommended production directories

These are recommendations only. This repository does **not** install or run the script on production automatically.

- Temporary root: `/var/tmp/wrong-notebook-no-images`
- Ready-to-download output: `/var/backups/wrong-notebook-no-images-ready`

Both directories should use `0700` permissions.

The script does **not** automatically repair permissions on existing directories.
Administrators must pre-create secure directories and ensure that:

- the directory is owned by the account running the script
- the directory is **not** a symlink
- no parent path component is a symlink
- group and other users do **not** have write permission

If an existing directory does not meet these requirements, the script refuses to run.

## Path and lock safety

- `--source-db`, `--output-dir`, `--temp-root`, and `--lock-file` must use absolute paths
- single quotes are intentionally rejected to avoid SQLite path injection
- symlink components are rejected for source, output, temp, and lock paths
- the lock file must be a regular file owned by the current user
- the script never auto-`chmod` existing output, temp, or lock directories
- publish targets fail closed if the final archive, sidecar, or `.part` file already exists
- the final `.tar.gz.sha256` sidecar is the completion marker for a successful backup package
- a standalone `.tar.gz` without the matching final sidecar must be treated as an incomplete artifact
- `.part` files are temporary staging files only and must never be downloaded or restored
- on normal failure paths, the script attempts to retract any just-published archive if the final sidecar is not published
- a hard kill (`SIGKILL`) or host crash can still leave an orphaned archive; consumers must ignore any archive that does not have its matching final sidecar

On Linux, the script resets `PATH` to:

```bash
/usr/sbin:/usr/bin:/sbin:/bin
```

before resolving external commands, so high-privilege runs do not trust a caller-provided `PATH`.

## Why this is separate from the full backup

The current production `backup.sh` is a full backup flow and retains complete database content. That is useful for server-side disaster recovery, but it is not suitable for the first-stage offsite package because the final offsite package must exclude all image data.

This no-image generator is intended for **auditable offsite distribution only**.

## Example invocation

Use only on an explicitly approved environment and only with an explicitly approved source database:

```bash
bash scripts/backup/create-no-images-backup.sh \
  --source-db /absolute/path/to/source.sqlite \
  --output-dir /absolute/path/to/output-dir \
  --temp-root /absolute/path/to/temp-root \
  --commit-sha f756135325f0004d84f0e1106c68c493f2a760a8 \
  --timezone Asia/Shanghai
```

Successful output is machine-readable:

```text
BACKUP_FILE=/absolute/path/to/wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz
CHECKSUM_FILE=/absolute/path/to/wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz.sha256
CREATED_AT=2026-07-11T23:00:00+08:00
IMAGES_EXCLUDED=true
```

## Testing

Static checks:

```bash
bash -n scripts/backup/create-no-images-backup.sh
bash -n scripts/backup/test-create-no-images-backup.sh
```

If `shellcheck` is available:

```bash
shellcheck scripts/backup/create-no-images-backup.sh
shellcheck scripts/backup/test-create-no-images-backup.sh
```

Functional test:

```bash
bash scripts/backup/test-create-no-images-backup.sh
```

The test uses only a temporary fixture database and does **not** read any production data.

## Out of scope

This first-stage implementation does **not** include:

- Windows pull client
- Windows Task Scheduler
- restricted SSH account setup
- production installation
- cleanup of existing full backups
- Next.js API or UI integration

## Security notes

- Do not expose this archive over public HTTP.
- Prefer a restricted SSH/SFTP pull workflow in the next phase.
- The source snapshot must remain temporary and must be deleted after the final sanitized database is created.
