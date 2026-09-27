# Host release bundle

The builder creates one standalone host release for the current platform and architecture. The output contains the web assets, server, runtime, CLI, Bun, Node, and native modules. It does not contain Electron.

Build the web assets, runtime, and server harnesses on the target ABI before you run the builder. Use the frozen dependency lockfile on that target. The output directory must not exist.

```sh
bun scripts/host-release/build.ts \
	--output "$release_path" \
	--version "$release_version" \
	--source-commit "$source_commit" \
	--database-version "$database_version"
```

The builder writes `release.json`. The manifest records the target tuple, compatibility ranges, pinned runtimes, Node ABI, native modules, executable entrypoints, and every file checksum.

Run preflight on the target host:

```sh
bun scripts/host-release/preflight.ts --release "$release_path"
```

Preflight prints one JSON result. A failed check sets `ok` to `false`, names each failed requirement, and exits with code 1. The integrity result reports a missing, altered, or unexpected file.

Run these repository checks on the host integration branch:

```sh
bun run lint
bun run typecheck
bun run typecheck:repo
bun test packages/api/src/hostRelease scripts/host-release
```

Build and check these target tuples in hosted integration jobs:

- Linux x64 with glibc 2.28
- Linux arm64 with glibc 2.28
- macOS x64 or arm64 at the supported deployment floor

Do not use one target dependency tree for another target. Each job builds `node-pty`, `fs-ext`, and `koffi` for its pinned Node ABI.

Start the server with a `PATH` that contains no system Node. Verify that the runtime and the Codex and Muse bridges use the bundled Node.
