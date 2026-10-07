#!/usr/bin/env bash
set -euo pipefail

product_root=${1:?Give the product worktree path.}
artifact_root=${2:?Give the artifact directory path.}
source=${3:?Give the exact product source commit.}
harness_root=$(cd "$(dirname "$0")" && pwd)
control_root=$(mktemp -d /tmp/trellis-trl1420-negative-XXXXXX)

cleanup() {
	rm -rf "$control_root"
}
trap cleanup EXIT INT TERM

expect_failure() {
	local name=$1
	local pattern=$2
	shift 2
	if "$@" > "$control_root/$name.log" 2>&1; then
		printf '%s unexpectedly passed.\n' "$name" >&2
		exit 1
	fi
	rg -F "$pattern" "$control_root/$name.log" >/dev/null
	printf '%s=failed_as_required\n' "$name"
}

expect_failure server-source-mismatch "served_source_mismatch" \
	env TRL1420_CASE=fresh-setup TRL1420_NEGATIVE_CONTROL=server-source-mismatch \
	"$harness_root/run.sh" "$product_root" "$artifact_root" "$source"

expect_failure save-enabled "Save server is enabled without a valid name." \
	env TRL1420_CASE=fresh-setup TRL1420_NEGATIVE_CONTROL=save-enabled \
	"$harness_root/run.sh" "$product_root" "$artifact_root" "$source"

expect_failure unrelated-network-error "http://unrelated.fixture.invalid/probe" \
	env TRL1420_CASE=unreachable-server TRL1420_NEGATIVE_CONTROL=unrelated-network-error \
	"$harness_root/run.sh" "$product_root" "$artifact_root" "$source"
