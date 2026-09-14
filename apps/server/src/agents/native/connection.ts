import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeClient } from "@trellis/runtime-protocol/client";

const pending = new Map<string, Promise<RuntimeClient>>();
export const nativeClient = (home: string) => new RuntimeClient(join(home, "runtime", "runtime.sock"));

const start = async (home: string) => {
	const client = nativeClient(home);
	try {
		await client.hello();
		return client;
	} catch (error) {
		if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
	}
	const directory = join(home, "runtime");
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const log = openSync(join(directory, "runtime.log"), "a", 0o600);
	const script =
		process.env.TRELLIS_RUNTIME_SCRIPT ?? fileURLToPath(new URL("../../../../runtime/dist/index.js", import.meta.url));
	const child = spawn(process.env.TRELLIS_RUNTIME_NODE ?? "node", [script, "--home", directory], {
		detached: true,
		stdio: ["ignore", log, log],
		env: process.env,
	});
	closeSync(log);
	let launchError: Error | undefined;
	child.once("error", (error) => {
		launchError = error;
	});
	child.unref();
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (launchError) throw launchError;
		try {
			await client.hello();
			return client;
		} catch (error) {
			if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		}
		await Bun.sleep(25);
	}
	throw new Error(`The execution service did not start. Read ${join(directory, "runtime.log")}.`);
};

export const ensureNativeRuntime = (home: string) => {
	const current = pending.get(home);
	if (current) return current;
	const promise = start(home).finally(() => pending.delete(home));
	pending.set(home, promise);
	return promise;
};
