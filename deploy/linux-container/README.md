# Linux host container

This package builds one Trellis host image for Linux x64 or Linux arm64. Each image uses a pinned Rocky Linux 8.10 base with glibc 2.28. A pinned Red Hat UBI 8 Node.js 24 stage supplies `libstdc++` and `libatomic` for the same architecture.

The image runs the Trellis services as a nonroot user. The image contains no Docker socket and needs no privileged mode. The root filesystem stays read-only. A local data mount keeps the database, agent workspaces, provider profiles, runtime records, and container metadata.

The container listens on `0.0.0.0:4521` in its private network. The manager publishes that port on outer host loopback only. The manager mounts one delegated cgroup v2 subtree. The container preflight creates a probe cgroup and refuses an unsupported delegation before it starts Trellis.

The engine supplies its small init process through `--init`. That process becomes container PID 1, forwards signals, and reaps orphaned children. The Trellis supervisor starts the runtime first. It starts the host after the runtime socket exists.

## Kernel and host requirements

Use Linux kernel 5.14 or later. Use cgroup v2 and pidfd. Delegate one cgroup subtree to the nonroot container user. Keep the data directory on a local filesystem.

Use a Linux OCI engine that supports these options:

- `--init`
- `--cgroupns private`
- `--cgroup-parent`
- a read-write bind mount of the delegated cgroup subtree
- a nonroot numeric user

Do not use NFS, CIFS, SMB, 9p, or SSHFS for the data directory. The preflight refuses these filesystems. Do not mount `/var/run/docker.sock` or another engine socket.

## Build the image

Build the host release on its target ABI first. Then build one image:

```sh
deploy/linux-container/build-image.sh \
	--release /opt/trellis/releases/<release-id> \
	--tag trellis-host:<release-id> \
	--arch amd64
```

Use `--arch arm64` for an arm64 release. The script checks the architecture and the glibc 2.28 target in `release.json`.

## Start one installation

Set the operator values:

```sh
export TRELLIS_CONTAINER_IMAGE=trellis-host:<release-id>
export TRELLIS_CONTAINER_DATA=/srv/trellis
export TRELLIS_CONTAINER_CGROUP=/sys/fs/cgroup/<delegated-subtree>
export TRELLIS_FORWARD_PORT=14521
```

Start the installation:

```sh
deploy/linux-container/trellis-container.sh start
```

The manager binds `127.0.0.1:14521` on the outer host. Use an SSH tunnel to forward that address. Do not publish the container port on a public interface.

The supervisor writes these owner-only files:

- `/srv/trellis/container/bootstrap.json`
- `/srv/trellis/container/auth-token`
- `/srv/trellis/container/state.json`

`bootstrap.json` contains the stable installation ID, the data home, the forwarded port, the release ID, and the token file path. Read it with this command:

```sh
deploy/linux-container/trellis-container.sh metadata
```

Read the bearer token only during the authenticated bootstrap:

```sh
deploy/linux-container/trellis-container.sh token
```

## Control service lifetime

Restart only the host:

```sh
deploy/linux-container/trellis-container.sh restart-host
```

This action sends `SIGUSR1` to the supervisor. The runtime PID stays unchanged.

Stop the host and runtime before replacement:

```sh
deploy/linux-container/trellis-container.sh stop-runtime
```

The image declares `SIGUSR2` as its stop signal. The supervisor stops the host first, stops the runtime, and writes `replacement-ready.json`. The replacement command refuses a running container or a missing marker.

Replace the stopped container:

```sh
export TRELLIS_CONTAINER_IMAGE=trellis-host:<new-release-id>
deploy/linux-container/trellis-container.sh replace
```

The new container uses the same data directory, installation ID, and bearer token. It removes the replacement marker after its preflight starts.

Remove the container and preserve the data directory:

```sh
deploy/linux-container/trellis-container.sh remove
```

## Verification

Run the focused source checks on the host integration branch:

```sh
bun test deploy/linux-container
```

Run the OCI integration on a Linux x64 or arm64 Alpine host:

```sh
TRELLIS_RELEASE_ROOT=/opt/trellis/releases/<release-id> \
TRELLIS_CONTAINER_CGROUP=/sys/fs/cgroup/<delegated-subtree> \
deploy/linux-container/integration-alpine.sh
```

The integration checks the Alpine userland, foreground supervision, data retention, a host-only restart, child reaping, owner-only metadata, anonymous refusal, and the runtime-stop replacement rule.

The lane owner also runs these repository checks:

```sh
bun run lint
bun run typecheck
bun run typecheck:repo
```
