import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ServiceTransport } from "../../db/transport";
import { LangflowHostControl, type LiveOwnership } from "../../langflowHost";
import { pairedBackup } from "./pairedBackup";

test("shutdown waits for an accepted backup and rejects new intake", async () => {
	const root = await mkdtemp(join(process.env.TMPDIR!, "trellis-paired-caller-"));
	const home = join(root, "home");
	await mkdir(home);
	const { identity } = LangflowHostControl.initialize({
		home,
		initialBlock: { requestId: "initial", reason: { kind: "initialize" } },
	});
	const observation: LiveOwnership = {
		id: "observation",
		identity: { ...identity, ownerId: "owner", instanceId: "instance", manifestDigest: "a".repeat(64) },
		endpoint: "http://127.0.0.1:7860",
		observedAt: "2026-09-29T00:00:00.000Z",
	};
	const entered = Promise.withResolvers<void>();
	const result = Promise.withResolvers<never>();
	let held = false;
	let entries = 0;
	let calls = 0;
	const transport: ServiceTransport = {
		call: async (name, context) => {
			expect(name).toBe("langflowBackup.readTrellisVersion");
			expect(context.actor).toEqual({ kind: "system", name: "trellis" });
			expect(held).toBe(true);
			calls++;
			entered.resolve();
			return result.promise;
		},
		start: async () => ({ applied: 0, liveShas: [] }),
		close: async () => {},
	};
	const connection = pairedBackup({
		home,
		transport,
		supervisor: {
			async withHealthyEngine<T>(operation: (current: LiveOwnership) => Promise<T>) {
				entries++;
				held = true;
				try {
					return await operation(observation);
				} finally {
					held = false;
				}
			},
		},
	});
	try {
		const work = connection.backup();
		const failed = work.then(
			() => null,
			(error: unknown) => error,
		);
		await entered.promise;
		let closed = false;
		const stop = connection.stop().then(() => {
			closed = true;
		});
		await Promise.resolve();
		expect(closed).toBe(false);
		expect(held).toBe(true);
		await expect(connection.backup()).rejects.toThrow("langflow_backup_stopping");
		const error = new Error("version_response_lost");
		result.reject(error);
		expect(await failed).toBe(error);
		await stop;
		expect(held).toBe(false);
		expect(entries).toBe(1);
		expect(calls).toBe(1);
		expect(LangflowHostControl.recovery(home).state).toBe("blocked");
	} finally {
		result.reject(new Error("fixture_cleanup"));
		await connection.stop();
		await rm(root, { recursive: true });
	}
});
