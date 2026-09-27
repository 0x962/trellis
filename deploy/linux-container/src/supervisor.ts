import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ContainerLifecycle, stateWriter, type ManagedProcess } from "./lifecycle.ts";
import { readAndVerifyRelease, runContainerPreflight } from "./preflight.ts";
import { prepareContainerState, writePrivateJson } from "./state.ts";

process.umask(0o077);

const releaseRoot = "/opt/trellis/release";
const dataHome = process.env.TRELLIS_HOME ?? "/var/lib/trellis";
const forwardedPort = Number(process.env.TRELLIS_FORWARD_PORT);
if (!Number.isInteger(forwardedPort) || forwardedPort < 1 || forwardedPort > 65535)
	throw new Error("TRELLIS_FORWARD_PORT must be an integer from 1 through 65535.");

const manifest = await readAndVerifyRelease(releaseRoot);
const preflight = await runContainerPreflight(dataHome, manifest);
const state = await prepareContainerState(dataHome, forwardedPort, manifest.releaseId);
process.stdout.write(`${JSON.stringify(preflight)}\n`);

const commonEnvironment = {
	...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
	HOME: state.paths.home,
	XDG_CONFIG_HOME: join(state.paths.home, ".config"),
	XDG_CACHE_HOME: join(state.paths.home, ".cache"),
	XDG_DATA_HOME: join(state.paths.home, ".local", "share"),
	PATH: `${join(releaseRoot, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
	TRELLIS_RELEASE_ID: manifest.releaseId,
};

const spawn = (service: "runtime" | "host"): ManagedProcess => {
	const executable = join(releaseRoot, manifest.entrypoints[service === "runtime" ? "runtime" : "server"]);
	const environment =
		service === "runtime"
			? commonEnvironment
			: {
					...commonEnvironment,
					TRELLIS_HOME: dataHome,
					TRELLIS_HOST: "0.0.0.0",
					TRELLIS_PORT: "4521",
					TRELLIS_AUTH_TOKEN: state.authToken,
					TRELLIS_WEB_DIST: join(releaseRoot, "apps/web/dist"),
					TRELLIS_RUNTIME_NODE: join(releaseRoot, manifest.entrypoints.node),
					TRELLIS_RUNTIME_SCRIPT: join(releaseRoot, "apps/runtime/dist/index.js"),
					TRELLIS_EXECUTION_BIN: join(releaseRoot, "bin"),
					TRELLIS_EXECUTION_SHELL: process.env.TRELLIS_EXECUTION_SHELL ?? "/bin/sh",
					TRELLIS_RUNTIME_MODE: "supervised",
					TRELLIS_CODEX_BRIDGE: join(releaseRoot, "apps/server/dist/codex-bridge.js"),
					TRELLIS_MUSE_BRIDGE: join(releaseRoot, "apps/server/dist/muse-bridge.js"),
				};
	const child = Bun.spawn({
		cmd: service === "runtime" ? [executable, "--home", state.paths.runtime] : [executable],
		env: environment,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return { pid: child.pid, exited: child.exited, kill: (signal) => child.kill(signal) };
};

const waitForRuntime = async () => {
	const socket = join(state.paths.runtime, "runtime.sock");
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (await Bun.file(socket).exists()) return;
		await delay(50);
	}
	throw new Error(`The runtime did not create ${socket}.`);
};

const lifecycle = new ContainerLifecycle({
	spawn,
	waitForRuntime,
	writeState: stateWriter(state.paths),
	markReplacementReady: async () =>
		writePrivateJson(state.paths.replacementReady, {
			schemaVersion: 1,
			installationId: state.metadata.installationId,
			stoppedAt: new Date().toISOString(),
		}),
	exit: (code) => process.exit(code),
});

process.on("SIGUSR1", () => void lifecycle.restartHost());
process.on("SIGUSR2", () => void lifecycle.stopForReplacement());
process.on("SIGTERM", () => process.stderr.write("Send SIGUSR2 to stop the runtime before container replacement.\n"));
process.on("SIGINT", () => process.stderr.write("Send SIGUSR2 to stop the runtime before container replacement.\n"));

await lifecycle.start();
