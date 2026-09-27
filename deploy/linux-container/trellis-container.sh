#!/bin/sh
set -eu

usage() {
	printf '%s\n' 'Usage: trellis-container.sh <start|restart-host|stop-runtime|replace|remove|metadata|token>' >&2
	exit 2
}

action=${1-}
[ -n "$action" ] || usage
engine=${CONTAINER_ENGINE:-docker}
name=${TRELLIS_CONTAINER_NAME:-trellis-host}
data=${TRELLIS_CONTAINER_DATA:-}
port=${TRELLIS_FORWARD_PORT:-}
cgroup=${TRELLIS_CONTAINER_CGROUP:-}
image=${TRELLIS_CONTAINER_IMAGE:-}

exists() {
	"$engine" container inspect "$name" >/dev/null 2>&1
}

running() {
	[ "$("$engine" container inspect --format '{{.State.Running}}' "$name")" = true ]
}

require_data() {
	[ -n "$data" ] || { printf '%s\n' 'TRELLIS_CONTAINER_DATA is required.' >&2; exit 1; }
	mkdir -p "$data"
	data=$(CDPATH= cd -- "$data" && pwd)
	chmod 0700 "$data"
}

require_create_input() {
	require_data
	[ -n "$port" ] || { printf '%s\n' 'TRELLIS_FORWARD_PORT is required.' >&2; exit 1; }
	[ -n "$cgroup" ] || { printf '%s\n' 'TRELLIS_CONTAINER_CGROUP is required.' >&2; exit 1; }
	[ -n "$image" ] || { printf '%s\n' 'TRELLIS_CONTAINER_IMAGE is required.' >&2; exit 1; }
	case "$port" in *[!0-9]*|'') printf '%s\n' 'TRELLIS_FORWARD_PORT must be an integer.' >&2; exit 1 ;; esac
	[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { printf '%s\n' 'TRELLIS_FORWARD_PORT must be from 1 through 65535.' >&2; exit 1; }
	[ "$(id -u)" -ne 0 ] || { printf '%s\n' 'Run the container as a nonroot user.' >&2; exit 1; }
	cgroup=$(CDPATH= cd -- "$cgroup" && pwd)
	case "$cgroup" in /sys/fs/cgroup/*) ;; *) printf '%s\n' 'TRELLIS_CONTAINER_CGROUP must be below /sys/fs/cgroup.' >&2; exit 1 ;; esac
	[ -w "$cgroup/cgroup.subtree_control" ] || { printf '%s\n' 'The cgroup subtree is not delegated to this user.' >&2; exit 1; }
	mkdir -p "$data/container"
	chmod 0700 "$data/container"
	printf 'trellis:x:%s:%s:Trellis:/var/lib/trellis/home:/bin/sh\n' "$(id -u)" "$(id -g)" > "$data/container/passwd"
	printf 'trellis:x:%s:\n' "$(id -g)" > "$data/container/group"
	chmod 0644 "$data/container/passwd" "$data/container/group"
}

create() {
	require_create_input
	cgroup_parent=${cgroup#/sys/fs/cgroup}
	"$engine" container create \
		--name "$name" \
		--init \
		--read-only \
		--user "$(id -u):$(id -g)" \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		--cgroupns private \
		--cgroup-parent "$cgroup_parent" \
		--mount "type=bind,source=$cgroup,target=/sys/fs/cgroup" \
		--mount "type=bind,source=$data,target=/var/lib/trellis" \
		--mount "type=bind,source=$data/container/passwd,target=/etc/passwd,readonly" \
		--mount "type=bind,source=$data/container/group,target=/etc/group,readonly" \
		--tmpfs /tmp:rw,noexec,nosuid,nodev,mode=1777 \
		--publish "127.0.0.1:$port:4521" \
		--env "TRELLIS_FORWARD_PORT=$port" \
		--env "TRELLIS_CONTAINER_NAME=$name" \
		--restart unless-stopped \
		"$image" >/dev/null
	"$engine" container start "$name" >/dev/null
}

case "$action" in
	start)
		if exists; then "$engine" container start "$name" >/dev/null; else create; fi
		;;
	restart-host)
		exists && running || { printf '%s\n' 'The Trellis container does not run.' >&2; exit 1; }
		"$engine" container kill --signal USR1 "$name" >/dev/null
		;;
	stop-runtime)
		exists || { printf '%s\n' 'The Trellis container does not exist.' >&2; exit 1; }
		if running; then "$engine" container stop --time 60 "$name" >/dev/null; fi
		;;
	replace)
		require_create_input
		exists || { printf '%s\n' 'The Trellis container does not exist.' >&2; exit 1; }
		running && { printf '%s\n' 'Stop the runtime before container replacement.' >&2; exit 1; }
		[ -f "$data/container/replacement-ready.json" ] || { printf '%s\n' 'The runtime stop has no replacement marker.' >&2; exit 1; }
		"$engine" container rm "$name" >/dev/null
		create
		;;
	remove)
		exists || exit 0
		if running; then "$engine" container stop --time 60 "$name" >/dev/null; fi
		"$engine" container rm "$name" >/dev/null
		;;
	metadata)
		require_data
		cat "$data/container/bootstrap.json"
		;;
	token)
		require_data
		cat "$data/container/auth-token"
		;;
	*) usage ;;
esac
