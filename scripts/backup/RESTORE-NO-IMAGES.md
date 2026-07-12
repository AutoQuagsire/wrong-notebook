# Restore guide for no-image backups

This restore flow is for the **no-image offsite backup package** only.

## Important limitations

- This backup restores **text and structured business data only**
- All image content is intentionally excluded
- Restored image fields remain empty:
  - `ErrorItem.originalImageUrl = ''`
  - `PracticeRecord.answerImageUrl = NULL`
- Image areas in the application must render as empty / hidden, not crash

## Before restoring

1. Stop application writes before replacing the database
2. Create a separate backup of the current damaged state
3. Verify the archive sidecar before extracting

## Verify archive integrity

Given:

- `wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz`
- `wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz.sha256`

Do not restore from:

- a standalone archive without the matching sidecar
- any `.part` file

Run:

```bash
sha256sum -c wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz.sha256
```

It must pass before extraction. Treat the sidecar as the completion marker for the backup package.

## Extract and verify package contents

```bash
tar -xzf wrong-notebook-no-images-YYYYMMDD-HHMMSS.tar.gz
sha256sum -c SHA256SUMS
```

Expected package structure:

```text
database/production-no-images.sqlite
manifest.json
SHA256SUMS
```

## Verify manifest

Confirm in `manifest.json`:

- `imagesExcluded` is `true`
- `excludedFields` includes:
  - `ErrorItem.originalImageUrl`
  - `PracticeRecord.answerImageUrl`

Do not proceed if the package does not clearly declare image exclusion.

## Verify database health before restore

Run:

```bash
sqlite3 database/production-no-images.sqlite "PRAGMA quick_check;"
sqlite3 database/production-no-images.sqlite "PRAGMA foreign_key_check;"
```

Expected:

- `quick_check` returns `ok`
- `foreign_key_check` returns no rows

## Restore sequence

1. Stop the application write path
2. Back up the current on-disk database before overwrite
3. Replace the target database with `database/production-no-images.sqlite`
4. Restore the correct owner, group, and permissions
5. Start the application

## Post-restore verification

Verify that the application still works for:

- user login
- subjects and text error items
- tags
- practice and review records
- FSRS state
- knowledge review / dictation flows
- image sections render empty but pages do not crash

## Rollback

If the no-image restore is not acceptable:

1. Stop writes again
2. Restore the pre-restore damaged-state backup
3. Re-apply original permissions
4. Start the application

This document intentionally omits any real hostnames, credentials, tokens, or private keys.
