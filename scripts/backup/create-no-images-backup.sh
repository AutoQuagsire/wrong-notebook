#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_NAME="$(basename "$0")"
CURRENT_EUID=""
BACKUP_TEST_MODE="${BACKUP_TEST_MODE:-0}"
BACKUP_TEST_INJECT="${BACKUP_TEST_INJECT:-}"

configure_safe_path() {
  case "${OSTYPE:-}" in
    linux*)
      PATH='/usr/sbin:/usr/bin:/sbin:/bin'
      export PATH
      ;;
  esac
}

usage() {
  cat <<'EOF'
Usage:
  create-no-images-backup.sh \
    --source-db <absolute-path> \
    --output-dir <absolute-path> \
    [--temp-root <absolute-path>] \
    [--lock-file <absolute-path>] \
    [--commit-sha <sha>] \
    [--timezone <tz>]

Required:
  --source-db   Absolute path to the source SQLite database.
  --output-dir  Absolute directory for the final archive and sidecar.

Optional:
  --temp-root   Absolute directory for secure temporary workdirs.
  --lock-file   Absolute path to the flock lock file.
  --commit-sha  Commit SHA written into manifest.json.
  --timezone    Timezone for timestamps (default: Asia/Shanghai).
EOF
}

log_error() {
  printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2
}

fail() {
  log_error "$*"
  exit 1
}

is_test_mode() {
  [[ "$BACKUP_TEST_MODE" == "1" ]]
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "missing dependency: $cmd"
}

path_exists_or_symlink() {
  local path="$1"
  [[ -e "$path" || -L "$path" ]]
}

ensure_no_newlines() {
  local value="$1"
  case "$value" in
    *$'\n'*|*$'\r'*) return 1 ;;
  esac
  return 0
}

ensure_safe_path_fragment() {
  local value="$1"
  ensure_no_newlines "$value" || return 1
  case "$value" in
    *"'"*) return 1 ;;
  esac
  return 0
}

ensure_absolute_dir_arg() {
  local value="$1"
  local label="$2"
  [[ -n "$value" ]] || fail "$label is required"
  ensure_safe_path_fragment "$value" || fail "$label contains unsupported characters"
  [[ "$value" == /* ]] || fail "$label must be an absolute path"
  [[ "$value" != "/" ]] || fail "$label must not be /"
}

ensure_absolute_file_arg() {
  local value="$1"
  local label="$2"
  [[ -n "$value" ]] || fail "$label is required"
  ensure_safe_path_fragment "$value" || fail "$label contains unsupported characters"
  [[ "$value" == /* ]] || fail "$label must be an absolute path"
  [[ "$value" != "/" ]] || fail "$label must not be /"
}

canonical_dir() {
  local dir="$1"
  assert_no_symlink_components "$dir"
  if [[ -d "$dir" ]]; then
    (
      cd "$dir" >/dev/null 2>&1 &&
        pwd -P
    )
  else
    local parent
    parent="$(dirname "$dir")"
    [[ -d "$parent" ]] || fail "parent directory does not exist: $parent"
    (
      cd "$parent" >/dev/null 2>&1 &&
        printf '%s/%s\n' "$(pwd -P)" "$(basename "$dir")"
    )
  fi
}

canonical_file() {
  local file="$1"
  assert_no_symlink_components "$file"
  [[ -e "$file" ]] || fail "source database not found: $file"
  [[ -f "$file" ]] || fail "source database must be a regular file: $file"
  [[ ! -L "$file" ]] || fail "source database must not be a symlink: $file"
  (
    cd "$(dirname "$file")" >/dev/null 2>&1 &&
      printf '%s/%s\n' "$(pwd -P)" "$(basename "$file")"
  )
}

trim_whitespace() {
  sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

assert_no_symlink_components() {
  local path="$1"
  local current="/"
  local remainder=""
  local component=""

  [[ "$path" == /* ]] || fail "path must be absolute"
  ensure_safe_path_fragment "$path" || fail "path contains unsupported characters"

  if [[ "$path" == "/" ]]; then
    return 0
  fi

  remainder="${path#/}"
  IFS='/' read -r -a components <<< "$remainder"
  for component in "${components[@]}"; do
    [[ -n "$component" ]] || continue
    if [[ "$current" == "/" ]]; then
      current="/${component}"
    else
      current="${current}/${component}"
    fi

    if [[ -L "$current" ]]; then
      fail "path must not contain symlink components: $current"
    fi

    if ! path_exists_or_symlink "$current"; then
      break
    fi
  done
}

owner_uid() {
  local path="$1"
  stat -c '%u' -- "$path"
}

mode_octal() {
  local path="$1"
  stat -c '%a' -- "$path"
}

ensure_owned_by_current_user() {
  local path="$1"
  local label="$2"
  local uid

  uid="$(owner_uid "$path")"
  [[ "$uid" == "$CURRENT_EUID" ]] || fail "$label must be owned by the current user"
}

ensure_not_group_or_other_writable() {
  local path="$1"
  local label="$2"
  local mode

  mode="$(mode_octal "$path")"
  (( (8#$mode & 8#022) == 0 )) || fail "$label must not be group or other writable"
}

ensure_secure_existing_dir() {
  local dir="$1"
  local label="$2"

  assert_no_symlink_components "$dir"
  path_exists_or_symlink "$dir" || fail "$label does not exist"
  [[ ! -L "$dir" ]] || fail "$label must not be a symlink"
  [[ -d "$dir" ]] || fail "$label must be a directory"
  ensure_owned_by_current_user "$dir" "$label"
  ensure_not_group_or_other_writable "$dir" "$label"
}

create_secure_dir() {
  local dir="$1"
  local label="$2"
  local parent

  parent="$(dirname "$dir")"
  ensure_secure_existing_dir "$parent" "$label parent directory"
  mkdir -m 700 -- "$dir"
  ensure_secure_existing_dir "$dir" "$label"
}

prepare_secure_dir() {
  local dir="$1"
  local label="$2"

  if path_exists_or_symlink "$dir"; then
    ensure_secure_existing_dir "$dir" "$label"
  else
    create_secure_dir "$dir" "$label"
  fi
}

prepare_secure_lock_file() {
  local lock_file="$1"
  local lock_parent

  lock_parent="$(dirname "$lock_file")"
  prepare_secure_dir "$lock_parent" "lock directory"

  if path_exists_or_symlink "$lock_file"; then
    [[ ! -L "$lock_file" ]] || fail "lock file must not be a symlink"
    [[ -f "$lock_file" ]] || fail "lock file must be a regular file"
    ensure_owned_by_current_user "$lock_file" "lock file"
    ensure_not_group_or_other_writable "$lock_file" "lock file"
  fi

  exec {LOCK_FD}>>"$lock_file"

  [[ ! -L "$lock_file" ]] || fail "lock file must not be a symlink"
  [[ -f "$lock_file" ]] || fail "lock file must be a regular file"
  ensure_owned_by_current_user "$lock_file" "lock file"
  ensure_not_group_or_other_writable "$lock_file" "lock file"

  flock -n -w 1 "$LOCK_FD" || fail "could not acquire backup lock: $lock_file"
}

ensure_publish_target_absent() {
  local path="$1"
  local label="$2"

  assert_no_symlink_components "$path"
  if path_exists_or_symlink "$path"; then
    fail "$label already exists: $path"
  fi
}

sqlite_cli_path() {
  local path="$1"
  local platform=""
  if command -v uname >/dev/null 2>&1; then
    platform="$(uname -s 2>/dev/null || true)"
  fi

  case "$platform" in
    MINGW*|MSYS*|CYGWIN*)
      if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$path"
        return
      fi
      ;;
  esac

  printf '%s\n' "$path"
}

check_quick() {
  local db="$1"
  local result
  result="$(sqlite3 "$(sqlite_cli_path "$db")" 'PRAGMA quick_check;' | trim_whitespace)"
  [[ "$result" == "ok" ]] || fail "quick_check failed for $(basename "$db"): ${result:-empty result}"
}

check_foreign_keys() {
  local db="$1"
  local result
  result="$(sqlite3 "$(sqlite_cli_path "$db")" 'PRAGMA foreign_key_check;')"
  [[ -z "$result" ]] || fail "foreign_key_check failed for $(basename "$db")"
}

query_single_value() {
  local db="$1"
  local sql="$2"
  sqlite3 "$(sqlite_cli_path "$db")" "$sql" | trim_whitespace
}

run_test_injection() {
  local injection_point="$1"

  if ! is_test_mode; then
    return 0
  fi

  case "$BACKUP_TEST_INJECT" in
    "$injection_point")
      fail "test injection triggered: $injection_point"
      ;;
  esac
}

scan_for_signature() {
  local file="$1"
  local signature="$2"
  local label="$3"
  local rc=0

  if is_test_mode; then
    case "$BACKUP_TEST_INJECT" in
      grep-exit-2)
        rc=2
        ;;
      grep-exit-7)
        rc=7
        ;;
      *)
        grep -aF -q -- "$signature" "$file" || rc=$?
        ;;
    esac
  else
    grep -aF -q -- "$signature" "$file" || rc=$?
  fi

  case "$rc" in
    0)
      fail "final database still contains forbidden signature: $label"
      ;;
    1)
      return 0
      ;;
    *)
      fail "image signature scan failed: $label (grep exit $rc)"
      ;;
  esac
}

validate_archive_members() {
  local archive_path="$1"
  local archive_member=""
  local member_count=0
  local seen_database_dir=false
  local seen_database_file=false
  local seen_manifest=false
  local seen_sha256s=false

  while IFS= read -r archive_member; do
    [[ -n "$archive_member" ]] || continue
    member_count=$((member_count + 1))
    case "$archive_member" in
      'database/')
        seen_database_dir=true
        ;;
      'database/production-no-images.sqlite')
        seen_database_file=true
        ;;
      'manifest.json')
        seen_manifest=true
        ;;
      'SHA256SUMS')
        seen_sha256s=true
        ;;
      *)
        fail "archive contains unexpected members"
        ;;
    esac
  done < <(tar -tzf "$archive_path")

  [[ "$seen_database_file" == "true" ]] || fail "archive missing sanitized database"
  [[ "$seen_manifest" == "true" ]] || fail "archive missing manifest"
  [[ "$seen_sha256s" == "true" ]] || fail "archive missing SHA256SUMS"
  (( member_count >= 3 && member_count <= 4 )) || fail "archive contains unexpected members"
}

write_sorted_schema_list() {
  local db="$1"
  local type="$2"
  local output="$3"

  case "$type" in
    table)
      sqlite3 "$(sqlite_cli_path "$db")" "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" >"$output"
      ;;
    index)
      sqlite3 "$(sqlite_cli_path "$db")" "SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name;" >"$output"
      ;;
    trigger)
      sqlite3 "$(sqlite_cli_path "$db")" "SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name;" >"$output"
      ;;
    view)
      sqlite3 "$(sqlite_cli_path "$db")" "SELECT name FROM sqlite_schema WHERE type='view' ORDER BY name;" >"$output"
      ;;
    *)
      fail "unsupported schema list type: $type"
      ;;
  esac
}

verify_required_columns() {
  local db="$1"
  local error_item_cols
  local practice_cols

  error_item_cols="$(sqlite3 "$(sqlite_cli_path "$db")" "PRAGMA table_info('ErrorItem');")"
  practice_cols="$(sqlite3 "$(sqlite_cli_path "$db")" "PRAGMA table_info('PracticeRecord');")"

  awk -F'|' '$2 == "originalImageUrl" && toupper($3) == "TEXT" && $4 == "1" { found = 1 } END { exit(found ? 0 : 1) }' <<<"$error_item_cols" \
    || fail "ErrorItem.originalImageUrl constraint mismatch"
  awk -F'|' '$2 == "answerImageUrl" && toupper($3) == "TEXT" && $4 == "0" { found = 1 } END { exit(found ? 0 : 1) }' <<<"$practice_cols" \
    || fail "PracticeRecord.answerImageUrl constraint mismatch"
}

write_schema_definition_list() {
  local db="$1"
  local type="$2"
  local output="$3"

  sqlite3 "$(sqlite_cli_path "$db")" \
    "SELECT name || '|' || COALESCE(sql, '') FROM sqlite_schema WHERE type='${type}' ORDER BY name;" >"$output"
}

write_table_row_counts() {
  local db="$1"
  local output="$2"
  local table_names=""
  local table_name=""
  local escaped_name=""
  local count=""

  table_names="$(sqlite3 "$(sqlite_cli_path "$db")" "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")"
  : >"$output"
  while IFS= read -r table_name; do
    [[ -n "$table_name" ]] || continue
    table_name="${table_name%$'\r'}"
    escaped_name="${table_name//\"/\"\"}"
    count="$(query_single_value "$db" "SELECT COUNT(*) FROM \"$escaped_name\";")"
    printf '%s|%s\n' "$table_name" "$count" >>"$output"
  done <<<"$table_names"
}

SOURCE_DB=""
OUTPUT_DIR=""
TEMP_ROOT="/var/tmp/wrong-notebook-no-images"
LOCK_FILE=""
COMMIT_SHA="unknown"
TIMEZONE="Asia/Shanghai"

configure_safe_path

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-db)
      SOURCE_DB="${2-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2-}"
      shift 2
      ;;
    --temp-root)
      TEMP_ROOT="${2-}"
      shift 2
      ;;
    --lock-file)
      LOCK_FILE="${2-}"
      shift 2
      ;;
    --commit-sha)
      COMMIT_SHA="${2-}"
      shift 2
      ;;
    --timezone)
      TIMEZONE="${2-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

require_cmd sqlite3
require_cmd tar
require_cmd sha256sum
require_cmd grep
require_cmd flock
require_cmd mktemp
require_cmd date
require_cmd awk
require_cmd basename
require_cmd dirname
require_cmd find
require_cmd cp
require_cmd sed
require_cmd sort
require_cmd cmp
require_cmd rm
require_cmd mkdir
require_cmd mv
require_cmd chmod
require_cmd tr
require_cmd wc
require_cmd stat
require_cmd id

CURRENT_EUID="$(id -u)"

ensure_absolute_file_arg "$SOURCE_DB" "--source-db"
ensure_absolute_dir_arg "$OUTPUT_DIR" "--output-dir"
ensure_absolute_dir_arg "$TEMP_ROOT" "--temp-root"

if [[ -n "$LOCK_FILE" ]]; then
  ensure_absolute_file_arg "$LOCK_FILE" "--lock-file"
else
  LOCK_FILE="${NO_IMAGE_BACKUP_LOCK_FILE:-$TEMP_ROOT/no-image-backup.lock}"
  ensure_absolute_file_arg "$LOCK_FILE" "lock file"
fi

ensure_safe_path_fragment "$COMMIT_SHA" || fail "--commit-sha contains unsupported characters"
[[ "$COMMIT_SHA" =~ ^[A-Za-z0-9._-]+$ ]] || COMMIT_SHA="unknown"
ensure_safe_path_fragment "$TIMEZONE" || fail "--timezone contains unsupported characters"

SOURCE_DB_REAL="$(canonical_file "$SOURCE_DB")"
OUTPUT_DIR_REAL="$(canonical_dir "$OUTPUT_DIR")"
TEMP_ROOT_REAL="$(canonical_dir "$TEMP_ROOT")"
LOCK_FILE_REAL="$(canonical_dir "$(dirname "$LOCK_FILE")")/$(basename "$LOCK_FILE")"

[[ "$SOURCE_DB_REAL" != "$OUTPUT_DIR_REAL" ]] || fail "--source-db and --output-dir must not be the same path"
[[ "$OUTPUT_DIR_REAL" != "/" ]] || fail "--output-dir must not resolve to /"
[[ "$TEMP_ROOT_REAL" != "/" ]] || fail "--temp-root must not resolve to /"

prepare_secure_dir "$OUTPUT_DIR_REAL" "output directory"
prepare_secure_dir "$TEMP_ROOT_REAL" "temp root directory"
prepare_secure_lock_file "$LOCK_FILE_REAL"

WORKDIR="$(mktemp -d "${TEMP_ROOT_REAL}/no-image-backup.XXXXXX")"
ensure_secure_existing_dir "$WORKDIR" "temp work directory"

SOURCE_SNAPSHOT="$WORKDIR/source-snapshot.sqlite"
FINAL_DB_TMP="$WORKDIR/production-no-images.sqlite"
PACKAGE_ROOT="$WORKDIR/package-root"
ARCHIVE_STEM=""
ARCHIVE_PART=""
SIDECAR_PART=""
ARCHIVE_PUBLISHED=false
SIDECAR_PUBLISHED=false
BACKUP_COMPLETE=false
ARCHIVE_PART_CREATED=false
SIDECAR_PART_CREATED=false
BACKUP_TEST_STAMP="${BACKUP_TEST_STAMP:-}"
cleanup() {
  local status=$?
  set +e
  if [[ "${ARCHIVE_PART_CREATED:-false}" == "true" && -n "${ARCHIVE_PART:-}" ]]; then
    rm -f -- "${ARCHIVE_PART}"
  fi
  if [[ "${SIDECAR_PART_CREATED:-false}" == "true" && -n "${SIDECAR_PART:-}" ]]; then
    rm -f -- "${SIDECAR_PART}"
  fi
  if [[ "${ARCHIVE_PUBLISHED:-false}" == "true" && "${SIDECAR_PUBLISHED:-false}" != "true" && -n "${ARCHIVE_PATH:-}" ]]; then
    rm -f -- "${ARCHIVE_PATH}"
  fi
  if [[ -n "${WORKDIR:-}" && -d "${WORKDIR:-}" ]]; then
    rm -rf -- "${WORKDIR:?}"
  fi
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

CREATED_AT="$(TZ="$TIMEZONE" date '+%Y-%m-%dT%H:%M:%S%:z')"
if is_test_mode && [[ -n "$BACKUP_TEST_STAMP" ]]; then
  [[ "$BACKUP_TEST_STAMP" =~ ^[0-9]{8}-[0-9]{6}$ ]] || fail "BACKUP_TEST_STAMP must match YYYYMMDD-HHMMSS"
  STAMP="$BACKUP_TEST_STAMP"
else
  STAMP="$(TZ="$TIMEZONE" date '+%Y%m%d-%H%M%S')"
fi
ARCHIVE_STEM="wrong-notebook-no-images-${STAMP}.tar.gz"
ARCHIVE_PATH="${OUTPUT_DIR_REAL}/${ARCHIVE_STEM}"
ARCHIVE_PART="${ARCHIVE_PATH}.part"
SIDECAR_PATH="${ARCHIVE_PATH}.sha256"
SIDECAR_PART="${SIDECAR_PATH}.part"

ensure_publish_target_absent "$ARCHIVE_PATH" "final archive"
ensure_publish_target_absent "$SIDECAR_PATH" "final checksum"
ensure_publish_target_absent "$ARCHIVE_PART" "archive .part"
ensure_publish_target_absent "$SIDECAR_PART" "checksum .part"

sqlite3 -readonly "$(sqlite_cli_path "$SOURCE_DB_REAL")" ".backup '$(sqlite_cli_path "$SOURCE_SNAPSHOT")'"
check_quick "$SOURCE_SNAPSHOT"
check_foreign_keys "$SOURCE_SNAPSHOT"
verify_required_columns "$SOURCE_SNAPSHOT"

SOURCE_ERROR_ITEM_COUNT="$(query_single_value "$SOURCE_SNAPSHOT" 'SELECT COUNT(*) FROM "ErrorItem";')"
SOURCE_PRACTICE_RECORD_COUNT="$(query_single_value "$SOURCE_SNAPSHOT" 'SELECT COUNT(*) FROM "PracticeRecord";')"

SOURCE_TABLES="$WORKDIR/source-tables.txt"
SOURCE_INDEXES="$WORKDIR/source-indexes.txt"
SOURCE_TRIGGERS="$WORKDIR/source-triggers.txt"
SOURCE_VIEWS="$WORKDIR/source-views.txt"
SOURCE_ROW_COUNTS="$WORKDIR/source-row-counts.txt"
FINAL_TABLES="$WORKDIR/final-tables.txt"
FINAL_INDEXES="$WORKDIR/final-indexes.txt"
FINAL_TRIGGERS="$WORKDIR/final-triggers.txt"
FINAL_VIEWS="$WORKDIR/final-views.txt"
FINAL_ROW_COUNTS="$WORKDIR/final-row-counts.txt"

write_sorted_schema_list "$SOURCE_SNAPSHOT" table "$SOURCE_TABLES"
write_sorted_schema_list "$SOURCE_SNAPSHOT" index "$SOURCE_INDEXES"
write_schema_definition_list "$SOURCE_SNAPSHOT" trigger "$SOURCE_TRIGGERS"
write_schema_definition_list "$SOURCE_SNAPSHOT" view "$SOURCE_VIEWS"
write_table_row_counts "$SOURCE_SNAPSHOT" "$SOURCE_ROW_COUNTS"
SOURCE_MIGRATION_COUNT="$(query_single_value "$SOURCE_SNAPSHOT" 'SELECT COUNT(*) FROM "_prisma_migrations";')"

sqlite3 "$(sqlite_cli_path "$SOURCE_SNAPSHOT")" <<'SQL'
BEGIN IMMEDIATE;
UPDATE "ErrorItem" SET "originalImageUrl" = '';
UPDATE "PracticeRecord" SET "answerImageUrl" = NULL;
COMMIT;
SQL

sqlite3 "$(sqlite_cli_path "$SOURCE_SNAPSHOT")" "VACUUM INTO '$(sqlite_cli_path "$FINAL_DB_TMP")';"
[[ -f "$FINAL_DB_TMP" ]] || fail "VACUUM INTO did not create final database"

rm -f -- "$SOURCE_SNAPSHOT" "${SOURCE_SNAPSHOT}-journal" "${SOURCE_SNAPSHOT}-wal" "${SOURCE_SNAPSHOT}-shm"

check_quick "$FINAL_DB_TMP"
check_foreign_keys "$FINAL_DB_TMP"

FINAL_ERROR_ITEM_COUNT="$(query_single_value "$FINAL_DB_TMP" 'SELECT COUNT(*) FROM "ErrorItem";')"
FINAL_PRACTICE_RECORD_COUNT="$(query_single_value "$FINAL_DB_TMP" 'SELECT COUNT(*) FROM "PracticeRecord";')"
[[ "$SOURCE_ERROR_ITEM_COUNT" == "$FINAL_ERROR_ITEM_COUNT" ]] || fail "ErrorItem row count mismatch after sanitization"
[[ "$SOURCE_PRACTICE_RECORD_COUNT" == "$FINAL_PRACTICE_RECORD_COUNT" ]] || fail "PracticeRecord row count mismatch after sanitization"

ERROR_ITEM_IMAGE_NON_EMPTY_COUNT="$(query_single_value "$FINAL_DB_TMP" "SELECT COUNT(*) FROM \"ErrorItem\" WHERE \"originalImageUrl\" <> '';")"
PRACTICE_IMAGE_NON_EMPTY_COUNT="$(query_single_value "$FINAL_DB_TMP" "SELECT COUNT(*) FROM \"PracticeRecord\" WHERE \"answerImageUrl\" IS NOT NULL AND \"answerImageUrl\" <> '';")"
[[ "$ERROR_ITEM_IMAGE_NON_EMPTY_COUNT" == "0" ]] || fail "sanitized ErrorItem image count is not zero"
[[ "$PRACTICE_IMAGE_NON_EMPTY_COUNT" == "0" ]] || fail "sanitized PracticeRecord image count is not zero"

write_sorted_schema_list "$FINAL_DB_TMP" table "$FINAL_TABLES"
write_sorted_schema_list "$FINAL_DB_TMP" index "$FINAL_INDEXES"
write_schema_definition_list "$FINAL_DB_TMP" trigger "$FINAL_TRIGGERS"
write_schema_definition_list "$FINAL_DB_TMP" view "$FINAL_VIEWS"
write_table_row_counts "$FINAL_DB_TMP" "$FINAL_ROW_COUNTS"
FINAL_MIGRATION_COUNT="$(query_single_value "$FINAL_DB_TMP" 'SELECT COUNT(*) FROM "_prisma_migrations";')"

cmp -s "$SOURCE_TABLES" "$FINAL_TABLES" || fail "table set changed during sanitization"
cmp -s "$SOURCE_INDEXES" "$FINAL_INDEXES" || fail "index set changed during sanitization"
cmp -s "$SOURCE_TRIGGERS" "$FINAL_TRIGGERS" || fail "trigger definitions changed during sanitization"
cmp -s "$SOURCE_VIEWS" "$FINAL_VIEWS" || fail "view definitions changed during sanitization"
cmp -s "$SOURCE_ROW_COUNTS" "$FINAL_ROW_COUNTS" || fail "table row counts changed during sanitization"

SOURCE_TRIGGER_COUNT="$(wc -l < "$SOURCE_TRIGGERS" | tr -d ' ')"
FINAL_TRIGGER_COUNT="$(wc -l < "$FINAL_TRIGGERS" | tr -d ' ')"
SOURCE_VIEW_COUNT="$(wc -l < "$SOURCE_VIEWS" | tr -d ' ')"
FINAL_VIEW_COUNT="$(wc -l < "$FINAL_VIEWS" | tr -d ' ')"
[[ "$SOURCE_TRIGGER_COUNT" == "$FINAL_TRIGGER_COUNT" ]] || fail "trigger count changed during sanitization"
[[ "$SOURCE_VIEW_COUNT" == "$FINAL_VIEW_COUNT" ]] || fail "view count changed during sanitization"
grep -qx '_prisma_migrations' "$FINAL_TABLES" || fail "_prisma_migrations table missing from final database"
[[ "$SOURCE_MIGRATION_COUNT" == "$FINAL_MIGRATION_COUNT" ]] || fail "_prisma_migrations row count changed during sanitization"

DATA_IMAGE_SIGNATURE_FOUND=false
BASE64_SIGNATURE_FOUND=false
if is_test_mode && [[ "$BACKUP_TEST_INJECT" == "inject-signature-before-scan" ]]; then
  printf '%s' 'data:image/' >> "$FINAL_DB_TMP"
fi
for signature in 'data:image/' ';base64,' 'image/png' 'image/jpeg' 'image/jpg' 'image/webp' 'image/gif' 'iVBORw0KGgo'; do
  scan_for_signature "$FINAL_DB_TMP" "$signature" "$signature"
done

mkdir -m 700 -- "$PACKAGE_ROOT"
mkdir -m 700 -- "$PACKAGE_ROOT/database"
cp "$FINAL_DB_TMP" "$PACKAGE_ROOT/database/production-no-images.sqlite"
chmod 600 "$PACKAGE_ROOT/database/production-no-images.sqlite"

SANITIZED_DB_SHA256="$(sha256sum "$PACKAGE_ROOT/database/production-no-images.sqlite" | awk '{print $1}')"

cat > "$PACKAGE_ROOT/manifest.json" <<EOF
{
  "formatVersion": 1,
  "createdAt": "${CREATED_AT}",
  "timezone": "${TIMEZONE}",
  "commitSha": "${COMMIT_SHA}",
  "sourceSnapshotMethod": "sqlite3-backup",
  "imagesExcluded": true,
  "excludedFields": [
    "ErrorItem.originalImageUrl",
    "PracticeRecord.answerImageUrl"
  ],
  "sanitizationMethod": "update-fields-and-vacuum-into",
  "databaseFile": "database/production-no-images.sqlite",
  "validationChecks": {
    "errorItemImageNonEmptyCount": ${ERROR_ITEM_IMAGE_NON_EMPTY_COUNT},
    "practiceImageNonEmptyCount": ${PRACTICE_IMAGE_NON_EMPTY_COUNT},
    "dataImageSignatureFound": ${DATA_IMAGE_SIGNATURE_FOUND},
    "base64SignatureFound": ${BASE64_SIGNATURE_FOUND},
    "quickCheck": "ok",
    "foreignKeyCheck": "ok"
  },
  "sanitizedDatabaseSha256": "${SANITIZED_DB_SHA256}",
  "errorItemCount": ${FINAL_ERROR_ITEM_COUNT},
  "practiceRecordCount": ${FINAL_PRACTICE_RECORD_COUNT}
}
EOF
chmod 600 "$PACKAGE_ROOT/manifest.json"

(
  cd "$PACKAGE_ROOT"
  sha256sum database/production-no-images.sqlite manifest.json > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
chmod 600 "$PACKAGE_ROOT/SHA256SUMS"

tar -czf "$ARCHIVE_PART" -C "$PACKAGE_ROOT" database manifest.json SHA256SUMS
ARCHIVE_PART_CREATED=true
chmod 600 "$ARCHIVE_PART"
[[ -f "$ARCHIVE_PART" ]] || fail "archive .part was not created"
[[ ! -L "$ARCHIVE_PART" ]] || fail "archive .part must not be a symlink"
[[ -s "$ARCHIVE_PART" ]] || fail "archive .part must not be empty"
validate_archive_members "$ARCHIVE_PART"

ARCHIVE_SHA256="$(sha256sum "$ARCHIVE_PART" | awk '{print $1}')"
[[ "$ARCHIVE_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "archive SHA-256 is invalid"
run_test_injection "fail-before-sidecar-write"
printf '%s  %s\n' "$ARCHIVE_SHA256" "$(basename "$ARCHIVE_PATH")" > "$SIDECAR_PART"
SIDECAR_PART_CREATED=true
chmod 600 "$SIDECAR_PART"
[[ -f "$SIDECAR_PART" ]] || fail "checksum .part was not created"
[[ ! -L "$SIDECAR_PART" ]] || fail "checksum .part must not be a symlink"
[[ -s "$SIDECAR_PART" ]] || fail "checksum .part must not be empty"
[[ "$(wc -l < "$SIDECAR_PART" | tr -d ' ')" == "1" ]] || fail "checksum .part must contain exactly one line"
grep -Eq "^[0-9a-f]{64}  $(basename "$ARCHIVE_PATH")$" "$SIDECAR_PART" || fail "checksum .part content is invalid"
run_test_injection "fail-before-archive-publish"
mv -f -- "$ARCHIVE_PART" "$ARCHIVE_PATH"
ARCHIVE_PUBLISHED=true
ARCHIVE_PART_CREATED=false

run_test_injection "fail-before-sidecar-publish"
mv -f -- "$SIDECAR_PART" "$SIDECAR_PATH"
SIDECAR_PUBLISHED=true
SIDECAR_PART_CREATED=false
BACKUP_COMPLETE=true

printf 'BACKUP_FILE=%s\n' "$ARCHIVE_PATH"
printf 'CHECKSUM_FILE=%s\n' "$SIDECAR_PATH"
printf 'CREATED_AT=%s\n' "$CREATED_AT"
printf 'IMAGES_EXCLUDED=true\n'
