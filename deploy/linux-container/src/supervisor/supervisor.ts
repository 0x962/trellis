import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ContainerLifecycle, createLifecycleStateWriter, type ManagedProcess } from "../lifecycle/index.ts";
import { createContainerLogger } from "../logger/index.ts";
import { readAndVerifyRelease, runContainerPreflight } from "../preflight/index.ts";
import { prepareContainerState, writePrivateJson } from "../state/index.ts";

process.umask(0o077);

const releaseRoot = "/opt/trellis/release";
const dataHome = process.env.TRELLIS_HOME ?? "/var/lib/trellis";
const forwardedPort = Number(process.env.TRELLIS_FORWARD_PORT);
if (!Number.isInteger(forwardedPort) || forwardedPort < 1 || forwardedPort > 65535)
	throw new Error("TRELLIS_FORWARD_PORT must be an integer from 1 through 65535.");

const manifest = await readAndVerifyRelease(releaseRoot);
await runContainerPreflight(dataHome, manifest);
const installation = await prepareContainerState(dataHome, forwardedPort, manifest.releaseId);
const log = createContainerLogger(manifest.releaseId, installation.metadata.installationId);
log({ event: "preflight_completed" });

const commonEnvironment = {
	...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
	HOME: installation.paths.home,
	XDG_CONFIG_HOME: join(installation.paths.home, ".config"),
	XDG_CACHE_HOME: join(installation.paths.home, ".cache"),
	XDG_DATA_HOME: join(installation.paths.home, ".local", "share"),
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
					TRELLIS_AUTH_TOKEN: installation.authToken,
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
		cmd: service === "runtime" ? [executable, "--home", installation.paths.runtime] : [executable],
		env: environment,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return { pid: child.pid, exited: child.exited, kill: (signal) => child.kill(signal) };
};

const waitForRuntime = async () => {
	const socket = join(installation.paths.runtime, "runtime.sock");
	const client = new RuntimeClient(socket, 250);
	for (let attempt = 0; attempt < 200; attempt += 1) {
		try {
			await client.hello();
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (!["ENOENT", "ECONNREFUSED", "ECONNRESET", "RUNTIME_TIMEOUT"].includes(code ?? "")) throw error;
		}
		await delay(50);
	}
	throw new Error(`The runtime did not answer hello on ${socket}.`);
};

const lifecycle = new ContainerLifecycle({
	spawn,
	waitForRuntime,
	writeState: createLifecycleStateWriter(installation.paths),
	markReplacementReady: async () =>
		writePrivateJson(installation.paths.replacementReady, {
			schemaVersion: 1,
			installationId: installation.metadata.installationId,
			stoppedAt: new Date().toISOString(),
		}),
	log,
	exit: (code) => process.exit(code),
});

process.on("SIGUSR1", () => void lifecycle.restartHost());
process.on("SIGUSR2", () => void lifecycle.stopForReplacement());
process.on("SIGTERM", () => log({ event: "replacement_stop_required" }));
process.on("SIGINT", () => log({ event: "replacement_stop_required" }));

await lifecycle.start();
