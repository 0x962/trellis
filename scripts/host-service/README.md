# Linux host service

The service script installs Trellis for one dedicated Linux user. It does not use a desktop session.

The installer uses two user units. `trellis-runtime.service` owns agent processes and the owner-only runtime socket. `trellis-host.service` owns the database writer and HTTP server.

The host unit wants the runtime unit. A host stop or restart does not stop the runtime unit.

## Requirements

Use a release that targets the Linux architecture of the host. Keep the data home on a local filesystem.

The install action runs the release preflight in a transient user unit. That unit receives the same cgroup delegation as the runtime unit.

The foreground action runs the preflight in the supervisor process. The supervisor must receive delegated cgroup v2 from its own service manager.

The installer verifies the release before it starts bundled code. The source preflight script then runs with the verified release Bun.

Use an unprivileged dedicated user. Do not share its data home with another host process.

## User service

Install the units:

```sh
bun scripts/host-service/service.ts install \
	--release /opt/trellis/releases/<release-id> \
	--data-home /home/trellis/.local/share/trellis
```

Start both services:

```sh
bun scripts/host-service/service.ts start
```

Read both service states and PIDs:

```sh
bun scripts/host-service/service.ts status
```

Stop only the host:

```sh
bun scripts/host-service/service.ts stop --service host
```

Start only the host:

```sh
bun scripts/host-service/service.ts start --service host
```

The runtime PID must stay unchanged during this host-only restart.

Stop both services:

```sh
bun scripts/host-service/service.ts stop
```

Remove the units and service credentials:

```sh
bun scripts/host-service/service.ts uninstall
```

The uninstall action does not remove the data home or the release.

## Boot persistence

A user unit normally starts after its user session starts. Enable linger to start the units during boot:

```sh
sudo loginctl enable-linger trellis
loginctl show-user trellis --property=Linger
```

An administrator can use system units instead. Copy both generated units to `/etc/systemd/system`.

Add `User=trellis` and `Group=trellis` to each `Service` section. Change each install target to `multi-user.target`.

Use `systemctl` without `--user` to manage those system units.

## Foreground supervisor commands

A non-systemd supervisor must run the runtime and host as separate programs. Start the runtime program first.

```sh
bun scripts/host-service/service.ts foreground \
	--service runtime \
	--release /opt/trellis/releases/<release-id> \
	--data-home /home/trellis/.local/share/trellis
```

Start the host program after the runtime prints its hello record:

```sh
bun scripts/host-service/service.ts foreground \
	--service host \
	--release /opt/trellis/releases/<release-id> \
	--data-home /home/trellis/.local/share/trellis \
	--auth-token-file /run/secrets/trellis-host-token
```

Each command replaces the script process with its service process. The supervisor can restart the host without a runtime restart.

## Integration checks

Run these checks on the host integration branch:

```sh
bun run lint
bun run typecheck
bun run typecheck:repo
bun test packages/cli/src/host/linuxService scripts/host-service
```

The integration environment must prove cold boot, logout, explicit stop, and non-systemd foreground operation. It must also prove a host-only restart.
