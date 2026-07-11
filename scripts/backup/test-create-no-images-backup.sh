#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TARGET_SCRIPT="${SCRIPT_DIR}/create-no-images-backup.sh"

fail() {
  printf 'TEST FAILED: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command for test: $1"
}

assert_file_exists() {
  [[ -f "$1" ]] || fail "expected file to exist: $1"
}

assert_dir_absent() {
  [[ ! -e "$1" ]] || fail "expected path to be absent: $1"
}

assert_eq() {
  [[ "$1" == "$2" ]] || fail "expected '$1' to equal '$2'"
}

assert_contains() {
  grep -F -q -- "$2" "$1" || fail "expected '$1' to contain '$2'"
}

assert_not_contains_binary() {
  if grep -aF -q -- "$2" "$1"; then
    fail "unexpected binary/text signature '$2' found in $1"
  fi
}

make_fake_dep_bin() {
  local target_dir="$1"
  local skip="$2"
  mkdir -p "$target_dir"
  local dep
  for dep in tar sha256sum grep flock mktemp date find sort cmp rm mkdir mv chmod sqlite3 awk basename dirname sed cp tr wc touch env uname; do
    if [[ "$dep" == "$skip" ]]; then
      continue
    fi
    cat > "${target_dir}/${dep}" <<EOF
#!/usr/bin/env bash
exec "$(command -v "$dep")" "\$@"
EOF
    chmod +x "${target_dir}/${dep}"
  done
}

make_flock_shim_bin() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  cat > "${target_dir}/flock" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

conflict_exit=1
command_mode="argv"
command_string=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--nonblock|-x|--exclusive|-s|--shared|-o|--close|-F|--no-fork|--verbose)
      shift
      ;;
    -w|--timeout|-E|--conflict-exit-code)
      [[ $# -ge 2 ]] || exit 64
      if [[ "$1" == "-E" || "$1" == "--conflict-exit-code" ]]; then
        conflict_exit="$2"
      fi
      shift 2
      ;;
    -c|--command)
      [[ $# -ge 2 ]] || exit 64
      command_mode="string"
      command_string="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    -*)
      exit 64
      ;;
    *)
      break
      ;;
  esac
done

[[ $# -ge 1 ]] || exit 64
lock_target="$1"
shift

if [[ "$lock_target" =~ ^[0-9]+$ ]]; then
  exit 64
fi

lock_dir="${lock_target}.lockdir"
if ! mkdir "$lock_dir" 2>/dev/null; then
  exit "$conflict_exit"
fi

cleanup() {
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

if [[ "$command_mode" == "string" ]]; then
  bash -lc "$command_string"
elif [[ $# -gt 0 ]]; then
  "$@"
fi
EOF
  chmod +x "${target_dir}/flock"
}

create_fixture_db() {
  local db_path="$1"
  sqlite3 "$db_path" <<'SQL'
PRAGMA foreign_keys = ON;
CREATE TABLE "_prisma_migrations" (
  "id" TEXT PRIMARY KEY,
  "checksum" TEXT NOT NULL
);
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE
);
CREATE TABLE "Subject" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Subject_name_userId_key" ON "Subject"("name", "userId");
CREATE TABLE "ErrorItem" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT,
  "originalImageUrl" TEXT NOT NULL,
  "questionText" TEXT,
  "answerText" TEXT,
  "analysis" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL
);
CREATE TABLE "PracticeRecord" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "errorItemId" TEXT,
  "practiceType" TEXT NOT NULL DEFAULT 'SIMILAR_QUESTION',
  "answerText" TEXT,
  "answerImageUrl" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem"("id") ON DELETE SET NULL
);
CREATE TABLE "KnowledgeItem" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE
);
CREATE VIEW "ErrorItemSummary" AS
SELECT "id", "questionText" FROM "ErrorItem";
CREATE TRIGGER "ErrorItemTouch"
AFTER UPDATE ON "ErrorItem"
BEGIN
  SELECT 1;
END;

INSERT INTO "_prisma_migrations" ("id", "checksum") VALUES ('m1', 'checksum-1');
INSERT INTO "User" ("id", "email") VALUES ('user-1', 'user@example.com');
INSERT INTO "Subject" ("id", "name", "userId") VALUES ('subject-1', 'Math', 'user-1');
INSERT INTO "ErrorItem" (
  "id", "userId", "subjectId", "originalImageUrl", "questionText", "answerText", "analysis", "updatedAt"
) VALUES
  ('err-1', 'user-1', 'subject-1', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'Question 1', 'Answer 1', 'Analysis 1', '2026-07-11T00:00:00+08:00'),
  ('err-2', 'user-1', 'subject-1', 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD', 'Question 2', 'Answer 2', 'Analysis 2', '2026-07-11T00:00:00+08:00');
INSERT INTO "PracticeRecord" (
  "id", "userId", "errorItemId", "practiceType", "answerText", "answerImageUrl"
) VALUES
  ('pr-1', 'user-1', 'err-1', 'ORIGINAL_REVIEW', 'Typed answer', 'data:image/jpeg;base64,answer-photo'),
  ('pr-2', 'user-1', 'err-2', 'ORIGINAL_REVIEW', 'No image answer', NULL);
INSERT INTO "KnowledgeItem" ("id", "userId", "subjectId", "prompt", "answer")
VALUES ('ki-1', 'user-1', 'subject-1', 'Prompt 1', 'Answer 1');
SQL
}

create_missing_column_db() {
  local db_path="$1"
  sqlite3 "$db_path" <<'SQL'
CREATE TABLE "ErrorItem" (
  "id" TEXT PRIMARY KEY,
  "originalImageUrl" TEXT NOT NULL
);
CREATE TABLE "PracticeRecord" (
  "id" TEXT PRIMARY KEY
);
SQL
}

require_cmd bash
require_cmd sqlite3
require_cmd tar
require_cmd sha256sum

[[ -f "$TARGET_SCRIPT" ]] || fail "target script not found: $TARGET_SCRIPT"

BASE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/no-image-backup test.XXXXXX")"
cleanup() {
  local status=$?
  set +e
  rm -rf -- "$BASE_DIR"
  exit "$status"
}
trap cleanup EXIT

SOURCE_DB="${BASE_DIR}/fixture source.db"
OUTPUT_DIR="${BASE_DIR}/output dir"
TEMP_ROOT="${BASE_DIR}/temp root"
EXTRACT_DIR="${BASE_DIR}/extracted"
LOCK_FILE="${BASE_DIR}/backup.lock"
MISSING_DEP_BIN="${BASE_DIR}/fake-bin"
FLOCK_SHIM_BIN="${BASE_DIR}/flock-shim-bin"
FAIL_OUTPUT_DIR="${BASE_DIR}/failure output"
MISSING_SOURCE="${BASE_DIR}/missing.db"
BROKEN_DB="${BASE_DIR}/broken.db"
TEST_PATH=""

mkdir -p "$OUTPUT_DIR" "$TEMP_ROOT" "$EXTRACT_DIR" "$FAIL_OUTPUT_DIR"

create_fixture_db "$SOURCE_DB"
SOURCE_SHA_BEFORE="$(sha256sum "$SOURCE_DB" | awk '{print $1}')"
make_flock_shim_bin "$FLOCK_SHIM_BIN"
TEST_PATH="${FLOCK_SHIM_BIN}:$PATH"

RUN_OUTPUT="$(
  PATH="$TEST_PATH" bash "$TARGET_SCRIPT" \
    --source-db "$SOURCE_DB" \
    --output-dir "$OUTPUT_DIR" \
    --temp-root "$TEMP_ROOT" \
    --lock-file "$LOCK_FILE" \
    --commit-sha "test-commit-123" \
    --timezone "Asia/Shanghai"
)"

BACKUP_FILE="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^BACKUP_FILE=//p')"
CHECKSUM_FILE="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^CHECKSUM_FILE=//p')"
CREATED_AT="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^CREATED_AT=//p')"
IMAGES_EXCLUDED="$(printf '%s\n' "$RUN_OUTPUT" | sed -n 's/^IMAGES_EXCLUDED=//p')"

assert_file_exists "$BACKUP_FILE"
assert_file_exists "$CHECKSUM_FILE"
assert_eq "$IMAGES_EXCLUDED" "true"
[[ -n "$CREATED_AT" ]] || fail "CREATED_AT missing"

grep -q "$(basename "$BACKUP_FILE")" "$CHECKSUM_FILE" || fail "sidecar does not reference archive name"
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null
)

ARCHIVE_LIST="$(tar -tzf "$BACKUP_FILE")"
printf '%s\n' "$ARCHIVE_LIST" | grep -qx 'database/production-no-images.sqlite' || fail "archive missing sanitized db"
printf '%s\n' "$ARCHIVE_LIST" | grep -qx 'manifest.json' || fail "archive missing manifest"
printf '%s\n' "$ARCHIVE_LIST" | grep -qx 'SHA256SUMS' || fail "archive missing SHA256SUMS"
if printf '%s\n' "$ARCHIVE_LIST" | grep -q 'source-snapshot.sqlite'; then
  fail "archive must not contain source snapshot"
fi
if printf '%s\n' "$ARCHIVE_LIST" | grep -q 'production.db'; then
  fail "archive must not contain original production.db"
fi
if printf '%s\n' "$ARCHIVE_LIST" | grep -q 'uploads'; then
  fail "archive must not contain uploads"
fi
if printf '%s\n' "$ARCHIVE_LIST" | grep -q '\.env'; then
  fail "archive must not contain .env"
fi
if printf '%s\n' "$ARCHIVE_LIST" | grep -q 'production.sql'; then
  fail "archive must not contain SQL dump"
fi

tar -xzf "$BACKUP_FILE" -C "$EXTRACT_DIR"
(
  cd "$EXTRACT_DIR"
  sha256sum -c SHA256SUMS >/dev/null
)

FINAL_DB="${EXTRACT_DIR}/database/production-no-images.sqlite"
MANIFEST="${EXTRACT_DIR}/manifest.json"
assert_file_exists "$FINAL_DB"
assert_file_exists "$MANIFEST"

ERROR_COUNT="$(sqlite3 "$FINAL_DB" "SELECT COUNT(*) FROM \"ErrorItem\" WHERE \"originalImageUrl\" <> '';")"
PRACTICE_COUNT="$(sqlite3 "$FINAL_DB" "SELECT COUNT(*) FROM \"PracticeRecord\" WHERE \"answerImageUrl\" IS NOT NULL AND \"answerImageUrl\" <> '';")"
assert_eq "$ERROR_COUNT" "0"
assert_eq "$PRACTICE_COUNT" "0"

assert_eq "$(sqlite3 "$FINAL_DB" 'SELECT COUNT(*) FROM "ErrorItem";')" "2"
assert_eq "$(sqlite3 "$FINAL_DB" 'SELECT COUNT(*) FROM "PracticeRecord";')" "2"
assert_eq "$(sqlite3 "$FINAL_DB" 'SELECT COUNT(*) FROM "_prisma_migrations";')" "1"
assert_eq "$(sqlite3 "$FINAL_DB" "SELECT answerText FROM \"PracticeRecord\" WHERE id = 'pr-1';")" "Typed answer"
assert_eq "$(sqlite3 "$FINAL_DB" 'PRAGMA quick_check;')" "ok"
assert_eq "$(sqlite3 "$FINAL_DB" 'PRAGMA foreign_key_check;')" ""

TABLES_FINAL="$(sqlite3 "$FINAL_DB" "SELECT group_concat(name, ',') FROM (SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name);")"
TABLES_SOURCE="$(sqlite3 "$SOURCE_DB" "SELECT group_concat(name, ',') FROM (SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name);")"
assert_eq "$TABLES_FINAL" "$TABLES_SOURCE"
INDEX_COUNT_FINAL="$(sqlite3 "$FINAL_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%';")"
INDEX_COUNT_SOURCE="$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%';")"
assert_eq "$INDEX_COUNT_FINAL" "$INDEX_COUNT_SOURCE"
TRIGGER_COUNT_FINAL="$(sqlite3 "$FINAL_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger';")"
TRIGGER_COUNT_SOURCE="$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger';")"
assert_eq "$TRIGGER_COUNT_FINAL" "$TRIGGER_COUNT_SOURCE"
VIEW_COUNT_FINAL="$(sqlite3 "$FINAL_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='view';")"
VIEW_COUNT_SOURCE="$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM sqlite_schema WHERE type='view';")"
assert_eq "$VIEW_COUNT_FINAL" "$VIEW_COUNT_SOURCE"

assert_not_contains_binary "$FINAL_DB" 'data:image/'
assert_not_contains_binary "$FINAL_DB" ';base64,'
assert_not_contains_binary "$FINAL_DB" 'iVBORw0KGgo'
assert_not_contains_binary "$FINAL_DB" 'answer-photo'

SOURCE_SHA_AFTER="$(sha256sum "$SOURCE_DB" | awk '{print $1}')"
assert_eq "$SOURCE_SHA_BEFORE" "$SOURCE_SHA_AFTER"
assert_contains "$SOURCE_DB" 'data:image/png;base64'
assert_contains "$SOURCE_DB" 'data:image/jpeg;base64'

if find "$TEMP_ROOT" -type f \( -name 'source-snapshot.sqlite' -o -name '*.part' \) | grep -q .; then
  fail "temporary snapshot or stray .part files left behind in temp root"
fi

set +e
PATH="$TEST_PATH" bash "$TARGET_SCRIPT" --source-db "$MISSING_SOURCE" --output-dir "$FAIL_OUTPUT_DIR" --temp-root "$TEMP_ROOT" >/dev/null 2>&1
STATUS_MISSING=$?
set -e
[[ $STATUS_MISSING -ne 0 ]] || fail "missing source database should fail"

set +e
PATH="$TEST_PATH" bash "$TARGET_SCRIPT" --source-db "$SOURCE_DB" --output-dir "/" --temp-root "$TEMP_ROOT" >/dev/null 2>&1
STATUS_DANGEROUS=$?
set -e
[[ $STATUS_DANGEROUS -ne 0 ]] || fail "dangerous output-dir should fail"

create_missing_column_db "$BROKEN_DB"
set +e
PATH="$TEST_PATH" bash "$TARGET_SCRIPT" --source-db "$BROKEN_DB" --output-dir "$FAIL_OUTPUT_DIR" --temp-root "$TEMP_ROOT" >/dev/null 2>&1
STATUS_BROKEN=$?
set -e
[[ $STATUS_BROKEN -ne 0 ]] || fail "missing required columns should fail"

make_fake_dep_bin "$MISSING_DEP_BIN" "sqlite3"
set +e
PATH="$MISSING_DEP_BIN:$FLOCK_SHIM_BIN" bash "$TARGET_SCRIPT" --source-db "$SOURCE_DB" --output-dir "$FAIL_OUTPUT_DIR" --temp-root "$TEMP_ROOT" >/dev/null 2>&1
STATUS_DEPS=$?
set -e
[[ $STATUS_DEPS -ne 0 ]] || fail "missing sqlite3 dependency should fail"

LOCK_HOLD_FILE="${BASE_DIR}/held.lock"
PATH="$TEST_PATH" flock -n "$LOCK_HOLD_FILE" bash -lc 'sleep 5' &
LOCK_HOLDER_PID=$!
sleep 1
set +e
PATH="$TEST_PATH" NO_IMAGE_BACKUP_LOCK_FILE="$LOCK_HOLD_FILE" bash "$TARGET_SCRIPT" \
  --source-db "$SOURCE_DB" \
  --output-dir "$FAIL_OUTPUT_DIR" \
  --temp-root "$TEMP_ROOT" >/dev/null 2>&1
STATUS_LOCK=$?
set -e
[[ $STATUS_LOCK -ne 0 ]] || fail "second instance should fail to acquire lock"
wait "$LOCK_HOLDER_PID"

if find "$TEMP_ROOT" -type f \( -name 'source-snapshot.sqlite' -o -name '*.part' \) | grep -q .; then
  fail "failure path left temporary snapshot or .part files behind"
fi
if find "$FAIL_OUTPUT_DIR" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.sha256' \) | grep -q .; then
  fail "failure path published final archive or sidecar"
fi

printf 'All no-image backup generator tests passed.\n'
