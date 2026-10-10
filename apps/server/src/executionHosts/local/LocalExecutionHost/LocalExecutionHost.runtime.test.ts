import { expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { ExecutionTarget } from "@trellis/runtime-protocol/execution";
import { executionHostContract } from "@trellis/runtime-protocol/execution/contract-fixture";
import { ensureNativeRuntime } from "../../../agents/native/connection.ts";
import { createLocalExecutionHost } from "./LocalExecutionHost.ts";

// A client that counts every request it sends, so the contract can prove
// that a refused target sends none.
class CountingClient extends RuntimeClient {
	count = 0;
	override call: RuntimeClient["call"] = (method, params, signal) => {
		this.count++;
		return super.call(method, params, signal);
	};
	override subscribe: RuntimeClient["subscribe"] = (id, offset, signal, stream) => {
		this.count++;
		return super.subscribe(id, offset, signal, stream);
	};
	override subscribeSession: RuntimeClient["subscribeSession"] = (id, signal) => {
		this.count++;
		return super.subscribeSession(id, signal);
	};
	override terminal: RuntimeClient["terminal"] = (id, offset, signal) => {
		this.count++;
		return super.terminal(id, offset, signal);
	};
}

const target: ExecutionTarget = {
	hostId: "01HOSTLOCAL",
	controlId: "01CONTROL",
	controllerOwnerEpoch: 1,
	runId: "01RUN",
	attemptId: "01ATTEMPT",
	generation: 1,
};

// The runtime builds and starts before the first case, the way
// `liveState.runtime.test.ts` starts it. A short prefix keeps the socket path
// under the macOS limit.
const previousScript = process.env.TRELLIS_RUNTIME_SCRIPT;
const home = await mkdtemp(join(tmpdir(), "trellis-exec-"));
await symlink(resolve(import.meta.dir, "../../../../../../node_modules"), join(home, "node_modules"));
const build = await Bun.build({
	entrypoints: [resolve(import.meta.dir, "../../../../../runtime/src/index.ts")],
	outdir: home,
	target: "node",
	external: ["fs-ext", "node-pty", "koffi"],
});
expect(build.success).toBe(true);
process.env.TRELLIS_RUNTIME_SCRIPT = join(home, "index.js");
await ensureNativeRuntime(home);

executionHostContract(async () => {
	const client = new CountingClient(join(home, "runtime", "runtime.sock"));
	const host = createLocalExecutionHost({
		binding: { hostId: target.hostId, controlId: target.controlId, controllerOwnerEpoch: 1 },
		home,
		localUrl: "http://127.0.0.1:1",
		connection: { socketPath: client.socketPath, client: () => client, ensure: async () => client },
		env: async () => ({}),
	});
	return {
		host,
		client,
		target,
		cwd: home,
		requests: () => client.count,
		close: async () => {
			if (previousScript === undefined) delete process.env.TRELLIS_RUNTIME_SCRIPT;
			else process.env.TRELLIS_RUNTIME_SCRIPT = previousScript;
			await client.shutdown();
			const deadline = Date.now() + 5000;
			while (existsSync(join(home, "runtime/manifest.json")) && Date.now() < deadline) await Bun.sleep(25);
			expect(existsSync(join(home, "runtime/manifest.json"))).toBe(false);
			await rm(home, { recursive: true, force: true });
		},
	};
});
