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
writer_guard_created=false
writer_guard=

container_exists() {
	if ! containers=$("$engine" container list --all --filter "name=^/${name}$" --format '{{.ID}}'); then
		printf '%s\n' 'The container engine could not list containers.' >&2
		exit 1
	fi
	[ -n "$containers" ]
}

container_is_running() {
	if ! containers=$("$engine" container list --filter "name=^/${name}$" --format '{{.ID}}'); then
		printf '%s\n' 'The container engine could not list running containers.' >&2
		exit 1
	fi
	[ -n "$containers" ]
}

prepare_data_home() {
	[ -n "$data" ] || { printf '%s\n' 'TRELLIS_CONTAINER_DATA is required.' >&2; exit 1; }
	mkdir -p "$data"
	data=$(CDPATH= cd -- "$data" && pwd)
	chmod 0700 "$data"
}

release_new_writer_guard() {
	if [ "$writer_guard_created" = true ]; then
		rm "$writer_guard/container-name"
		rmdir "$writer_guard"
	fi
}

trap release_new_writer_guard EXIT
trap 'exit 130' HUP INT TERM

acquire_writer_guard() {
	mkdir -p "$data/container"
	chmod 0700 "$data/container"
	writer_guard="$data/container/writer.lock"
	if mkdir "$writer_guard" 2>/dev/null; then
		printf '%s\n' "$name" > "$writer_guard/container-name"
		chmod 0600 "$writer_guard/container-name"
		writer_guard_created=true
		return
	fi
	[ -d "$writer_guard" ] || { printf '%s\n' "The writer guard cannot be created at $writer_guard." >&2; exit 1; }
	[ -f "$writer_guard/container-name" ] || { printf '%s\n' "The writer guard is incomplete at $writer_guard." >&2; exit 1; }
	owner=$(cat "$writer_guard/container-name")
	[ "$owner" = "$name" ] || {
		printf '%s\n' "The data home belongs to container $owner, not $name." >&2
		exit 1
	}
}

retain_writer_guard() {
	writer_guard_created=false
}

remove_writer_guard() {
	owner=$(cat "$writer_guard/container-name")
	[ "$owner" = "$name" ] || { printf '%s\n' "The data home belongs to container $owner, not $name." >&2; exit 1; }
	rm "$writer_guard/container-name"
	rmdir "$writer_guard"
	writer_guard_created=false
}

prepare_container_inputs() {
	prepare_data_home
	[ -n "$port" ] || { printf '%s\n' 'TRELLIS_FORWARD_PORT is required.' >&2; exit 1; }
	[ -n "$cgroup" ] || { printf '%s\n' 'TRELLIS_CONTAINER_CGROUP is required.' >&2; exit 1; }
	[ -n "$image" ] || { printf '%s\n' 'TRELLIS_CONTAINER_IMAGE is required.' >&2; exit 1; }
	case "$port" in *[!0-9]*|'') printf '%s\n' 'TRELLIS_FORWARD_PORT must be an integer.' >&2; exit 1 ;; esac
	[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { printf '%s\n' 'TRELLIS_FORWARD_PORT must be from 1 through 65535.' >&2; exit 1; }
	[ "$(id -u)" -ne 0 ] || { printf '%s\n' 'Run the container as a nonroot user.' >&2; exit 1; }
	cgroup=$(CDPATH= cd -- "$cgroup" && pwd)
	case "$cgroup" in /sys/fs/cgroup/*) ;; *) printf '%s\n' 'TRELLIS_CONTAINER_CGROUP must be below /sys/fs/cgroup.' >&2; exit 1 ;; esac
	[ -w "$cgroup/cgroup.subtree_control" ] || { printf '%s\n' 'The cgroup subtree is not delegated to this user.' >&2; exit 1; }
	printf 'trellis:x:%s:%s:Trellis:/var/lib/trellis/home:/bin/sh\n' "$(id -u)" "$(id -g)" > "$data/container/passwd"
	printf 'trellis:x:%s:\n' "$(id -g)" > "$data/container/group"
	chmod 0644 "$data/container/passwd" "$data/container/group"
}

create_and_start_container() {
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
		--restart unless-stopped \
		"$image" >/dev/null
	"$engine" container start "$name" >/dev/null
}

case "$action" in
	start)
		prepare_data_home
		acquire_writer_guard
		if container_exists; then
			"$engine" container start "$name" >/dev/null
		else
			prepare_container_inputs
			create_and_start_container
		fi
		retain_writer_guard
		;;
	restart-host)
		container_exists && container_is_running || { printf '%s\n' 'The Trellis container does not run.' >&2; exit 1; }
		"$engine" container kill --signal USR1 "$name" >/dev/null
		;;
	stop-runtime)
		container_exists || { printf '%s\n' 'The Trellis container does not exist.' >&2; exit 1; }
		if container_is_running; then "$engine" container stop --time 60 "$name" >/dev/null; fi
		;;
	replace)
		prepare_data_home
		acquire_writer_guard
		prepare_container_inputs
		container_exists || { printf '%s\n' 'The Trellis container does not exist.' >&2; exit 1; }
		container_is_running && { printf '%s\n' 'Stop the runtime before container replacement.' >&2; exit 1; }
		[ -f "$data/container/replacement-ready.json" ] || { printf '%s\n' 'The runtime stop has no replacement marker.' >&2; exit 1; }
		"$engine" container rm "$name" >/dev/null
		create_and_start_container
		retain_writer_guard
		;;
	remove)
		prepare_data_home
		acquire_writer_guard
		if container_exists; then
			if container_is_running; then "$engine" container stop --time 60 "$name" >/dev/null; fi
			"$engine" container rm "$name" >/dev/null
		fi
		remove_writer_guard
		;;
	metadata)
		prepare_data_home
		cat "$data/container/bootstrap.json"
		;;
	token)
		prepare_data_home
		cat "$data/container/auth-token"
		;;
	*) usage ;;
esac
