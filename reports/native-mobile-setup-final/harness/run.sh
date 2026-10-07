#!/usr/bin/env bash
set -euo pipefail

product_root=${1:?Give the product worktree path.}
artifact_root=${2:?Give the artifact directory path.}
expected_source=${3:?Give the exact product source commit.}
harness_root=$(cd "$(dirname "$0")" && pwd)
run_root=$(mktemp -d /tmp/trellis-trl1420-XXXXXX)
staged_artifact="$run_root/artifact"
export_key=$(cat "$harness_root/metro.config.cjs" "$harness_root/sqlite-kv-shim.js" "$harness_root/camera-shim.js" | sha256sum | cut -d " " -f 1)
web_root="/tmp/trellis-trl1420-web-$expected_source-$export_key"
bun_root=/home/boxd/.cache/trl1420-bun-1.3.13
server_pid=

cleanup() {
	if test -n "$server_pid"; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	rm -rf "$run_root"
}
trap cleanup EXIT INT TERM

actual_source=$(git -C "$product_root" rev-parse HEAD)
test "$actual_source" = "$expected_source"
test -z "$(git -C "$product_root" status --porcelain)"
mkdir -p "$staged_artifact" "$bun_root"

bun_bin="$bun_root/bun-linux-x64/bun"
if ! test -x "$bun_bin"; then
	curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v1.3.13/bun-linux-x64.zip" -o "$run_root/bun.zip"
	unzip -q "$run_root/bun.zip" -d "$bun_root"
fi
test "$("$bun_bin" --version)" = "1.3.13"

if ! test -f "$web_root/index.html"; then
	sha256sum "$product_root/apps/mobile/package.json" "$product_root/bun.lock" > "$run_root/deps-before.sha256"
	cd "$product_root"
	"$bun_bin" install --frozen-lockfile
	"$bun_bin" add --no-save --cwd apps/mobile react-native-web@0.21.2 @expo/metro-runtime@57.0.15
	sha256sum "$product_root/apps/mobile/package.json" "$product_root/bun.lock" > "$run_root/deps-after.sha256"
	diff -u "$run_root/deps-before.sha256" "$run_root/deps-after.sha256"

	cd "$product_root/apps/mobile"
	TRL1420_PROJECT_METRO_CONFIG="$product_root/apps/mobile/metro.config.js" \
	TRL1420_SQLITE_SHIM="$harness_root/sqlite-kv-shim.js" \
	TRL1420_CAMERA_SHIM="$harness_root/camera-shim.js" \
	TRL1420_HARNESS_ROOT="$harness_root" \
	EXPO_OVERRIDE_METRO_CONFIG="$harness_root/metro.config.cjs" \
		"$bun_bin" x expo export --platform web --output-dir "$web_root"
fi

browser_root=/home/boxd/.cache/trl1420-playwright
mkdir -p "$browser_root"
PLAYWRIGHT_BROWSERS_PATH="$browser_root" "$bun_bin" x playwright install chromium

TRL1420_WEB_ROOT="$web_root" TRL1420_PORT=4173 \
	"$bun_bin" "$harness_root/serve.ts" > "$run_root/server.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 40); do
	if curl -fsSI http://127.0.0.1:4173/setup > "$run_root/headers.txt"; then break; fi
	sleep 0.25
done
curl -fsSI http://127.0.0.1:4173/setup > "$run_root/headers.txt"
rg -qi '^cross-origin-opener-policy: same-origin' "$run_root/headers.txt"
rg -qi '^cross-origin-embedder-policy: require-corp' "$run_root/headers.txt"

PLAYWRIGHT_BROWSERS_PATH="$browser_root" \
TRL1420_PRODUCT_ROOT="$product_root" \
TRL1420_ARTIFACT_ROOT="$staged_artifact" \
TRL1420_SOURCE="$actual_source" \
TRL1420_BASE_URL="http://127.0.0.1:4173" \
	"$bun_bin" "$harness_root/capture.ts"

if test -n "${TRL1420_CASE:-}"; then
	printf "isolated_case=%s\n" "$TRL1420_CASE"
	exit 0
fi

jq -e '.source == $source and .counts.cases == 42 and .counts.screenshots == 42 and .counts.casesWithAxeViolations == 0 and .counts.casesWithHorizontalOverflow == 0 and .counts.casesWithUnexpectedConsoleErrors == 0 and .counts.casesWithUnexpectedFailedRequests == 0 and .counts.casesWithPageErrors == 0' --arg source "$actual_source" "$staged_artifact/results.json" >/dev/null

rm -rf "$artifact_root/assets"
cp -R "$staged_artifact/assets" "$artifact_root/assets"
cp "$staged_artifact/index.html" "$artifact_root/index.html"
cp "$staged_artifact/results.json" "$artifact_root/results.json"
cd "$artifact_root"
find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 sha256sum > manifest.sha256
sha256sum --check manifest.sha256
jq -e '.source == $source and .counts.cases == 42 and .counts.screenshots == 42 and .counts.casesWithAxeViolations == 0 and .counts.casesWithHorizontalOverflow == 0 and .counts.casesWithUnexpectedConsoleErrors == 0 and .counts.casesWithUnexpectedFailedRequests == 0 and .counts.casesWithPageErrors == 0' --arg source "$actual_source" results.json >/dev/null

test -z "$(git -C "$product_root" status --porcelain)"
printf 'source=%s\nartifact=%s\nserver_pid=%s\n' "$actual_source" "$artifact_root" "$server_pid"
