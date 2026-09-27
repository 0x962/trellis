#!/bin/sh
set -eu

. /etc/os-release
[ "${ID:-}" = alpine ] || { printf '%s\n' 'Run this integration on an Alpine host.' >&2; exit 1; }
[ -n "${TRELLIS_RELEASE_ROOT:-}" ] || { printf '%s\n' 'TRELLIS_RELEASE_ROOT is required.' >&2; exit 1; }
[ -n "${TRELLIS_CONTAINER_CGROUP:-}" ] || { printf '%s\n' 'TRELLIS_CONTAINER_CGROUP is required.' >&2; exit 1; }

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
engine=${CONTAINER_ENGINE:-docker}
arch=$(uname -m)
case "$arch" in x86_64) image_arch=amd64 ;; aarch64) image_arch=arm64 ;; *) printf '%s\n' "Unsupported architecture: $arch" >&2; exit 1 ;; esac
fixture=$(mktemp -d "${TMPDIR:-/tmp}/trellis-linux-container.XXXXXX")
name="trellis-container-test-$$"
image="trellis-linux-container-test:$$"
port=${TRELLIS_FORWARD_PORT:-14521}

cleanup() {
	status=$?
	cleanup_failed=false
	if ! containers=$("$engine" container list --all --filter "name=^/${name}$" --format '{{.ID}}'); then
		printf '%s\n' 'Cleanup could not list containers.' >&2
		cleanup_failed=true
	elif [ -n "$containers" ] && ! TRELLIS_CONTAINER_NAME=$name TRELLIS_CONTAINER_DATA="$fixture/data" "$root/trellis-container.sh" remove; then
		printf '%s\n' "Cleanup could not remove container $name." >&2
		cleanup_failed=true
	fi
	if ! images=$("$engine" image list --filter "reference=$image" --format '{{.ID}}'); then
		printf '%s\n' 'Cleanup could not list images.' >&2
		cleanup_failed=true
	elif [ -n "$images" ] && ! "$engine" image rm "$image" >/dev/null; then
		printf '%s\n' "Cleanup could not remove image $image." >&2
		cleanup_failed=true
	fi
	if [ "$cleanup_failed" = true ]; then
		printf '%s\n' "Cleanup kept the fixture at $fixture." >&2
		status=1
	elif [ "${KEEP_TRELLIS_CONTAINER_FIXTURE:-0}" != 1 ]; then
		rm -rf "$fixture"
	fi
	trap - EXIT INT TERM
	exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

CONTAINER_ENGINE="$engine" "$root/build-image.sh" --release "$TRELLIS_RELEASE_ROOT" --tag "$image" --arch "$image_arch"
export CONTAINER_ENGINE="$engine"
export TRELLIS_CONTAINER_NAME="$name"
export TRELLIS_CONTAINER_DATA="$fixture/data"
export TRELLIS_CONTAINER_IMAGE="$image"
export TRELLIS_FORWARD_PORT="$port"

"$root/trellis-container.sh" start

wait_for_anonymous_refusal() {
	for attempt in $(seq 1 200); do
		code=$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/" || true)
		[ "$code" = 401 ] && return
		sleep 0.1
	done
	printf '%s\n' 'The Trellis host did not refuse the anonymous request.' >&2
	exit 1
}

first_numeric_json_field() {
	sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" "$1" | head -n 1
}

wait_for_anonymous_refusal
[ "$(stat -c %a "$fixture/data/container/bootstrap.json")" = 600 ]
[ "$(stat -c %a "$fixture/data/container/auth-token")" = 600 ]
token=$(cat "$fixture/data/container/auth-token")
[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --header "Authorization: Bearer $token" "http://127.0.0.1:$port/")" = 200 ]

state="$fixture/data/container/state.json"
runtime_before=$(first_numeric_json_field "$state" pid)
host_before=$(sed -n '/"host"[[:space:]]*:/,/}/s/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$state" | head -n 1)
"$root/trellis-container.sh" restart-host
for attempt in $(seq 1 100); do
	runtime_after=$(first_numeric_json_field "$state" pid)
	host_after=$(sed -n '/"host"[[:space:]]*:/,/}/s/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$state" | head -n 1)
	[ "$runtime_after" = "$runtime_before" ] && [ "$host_after" != "$host_before" ] && break
	sleep 0.1
done
[ "$runtime_after" = "$runtime_before" ]
[ "$host_after" != "$host_before" ]

"$engine" exec "$name" sh -c 'sh -c "sleep 0.1 &"; sleep 0.3'
zombies=$("$engine" exec "$name" sh -c 'for file in /proc/[0-9]*/status; do grep -q "^State:.*Z" "$file" && printf "%s\n" "$file"; done; exit 0')
[ -z "$zombies" ]

printf '%s\n' retained > "$fixture/data/persistence-fixture"
if "$root/trellis-container.sh" replace; then
	printf '%s\n' 'Container replacement succeeded before the runtime stop.' >&2
	exit 1
fi
"$root/trellis-container.sh" stop-runtime
[ -f "$fixture/data/container/replacement-ready.json" ]
"$root/trellis-container.sh" replace
wait_for_anonymous_refusal
[ "$(cat "$fixture/data/persistence-fixture")" = retained ]
[ "$(cat "$fixture/data/container/auth-token")" = "$token" ]

printf '%s\n' 'The Alpine container integration passed.'
