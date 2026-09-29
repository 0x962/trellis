import { expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeterministicProcessHost } from "./deterministicProcess.ts";
import type { persistentCancellationFixture } from "./persistentCancellationFixture.ts";
import type { CrashBoundaryEvidence } from "./persistentNativeLifecycleFixture.ts";
import { createPersistentNativeLifecycleFixture } from "./persistentNativeLifecycleSetup.ts";

type Marker = CrashBoundaryEvidence & {
	action: string;
	authorityPid: number;
	state: Awaited<ReturnType<ReturnType<typeof persistentCancellationFixture>["state"]>>;
	claimAvailable?: boolean;
	errors?: string[];
	recorded?: boolean;
	snapshot?: { resultId: string | null; result: string | null };
	nativeStatus: "running" | "exited" | null;
	nativeExitCode: number | null;
};
const workerPath = join(import.meta.dir, "cancellationAuthorityProcess.ts");

export function cancellationProcessFixture() {
	const homes: string[] = [];
	const workers = new Map<number, { child: ReturnType<typeof Bun.spawn>; exit: number | null }>();
	const trace: Record<string, unknown>[] = [];
	const create = async (humanFirst = false) => {
		const home = await mkdtemp(join(tmpdir(), "trellis-native-cancellation-"));
		homes.push(home);
		await createPersistentNativeLifecycleFixture(home, humanFirst);
		return home;
	};
	const execute = async (home: string, action: string, kill = false) => {
		const markerPath = join(home, `${action}-${crypto.randomUUID()}.json`);
		await writeFile(join(home, "cancel-invocation.json"), JSON.stringify({ home, action, marker: markerPath }), {
			mode: 0o600,
		});
		const child = Bun.spawn([process.execPath, "test", workerPath], { cwd: home, stdout: "pipe", stderr: "pipe" });
		const record = { child, exit: null as number | null };
		workers.set(child.pid, record);
		const exited = child.exited.then((code) => {
			record.exit = code;
			return code;
		});
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		const deadline = Date.now() + 30_000;
		while (!existsSync(markerPath)) {
			if (record.exit !== null) throw new Error(`cancellation writer exited ${record.exit}: ${await stderr}`);
			if (Date.now() > deadline) throw new Error(`cancellation writer ${child.pid} did not reach ${action}`);
			await Bun.sleep(10);
		}
		const marker = JSON.parse(await readFile(markerPath, "utf8")) as Marker;
		expect(marker.authorityPid).toBe(child.pid);
		if (kill) child.kill("SIGKILL");
		const exit = await exited;
		const output = { stdout: await stdout, stderr: await stderr };
		trace.push({ home, ...marker, exit, signal: kill ? "SIGKILL" : null, ...output });
		if (kill) expect(exit).not.toBe(0);
		else if (exit !== 0) throw new Error(`cancellation writer exited ${exit}: ${output.stderr}`);
		return marker;
	};
	const cleanup = async () => {
		for (const record of workers.values()) {
			if (record.exit === null) {
				record.child.kill("SIGKILL");
				record.exit = await record.child.exited;
			}
		}
		const native: { home: string; pids: number[]; survivingPids: number[] }[] = [];
		for (const home of homes) {
			const directory = join(home, "native-processes");
			if (existsSync(directory)) {
				const host = DeterministicProcessHost.open(directory, () => new Date().toISOString());
				const records = await host.records();
				const closed = await host.close();
				native.push({
					home,
					pids: records.flatMap((record) => (record.pid === null ? [] : [record.pid])),
					survivingPids: closed.survivingPids,
				});
			}
			await rm(home, { recursive: true, force: true });
		}
		const result = {
			authorities: [...workers].map(([pid, record]) => ({ pid, exit: record.exit })),
			native,
			homes,
			directoriesRemoved: homes.every((home) => !existsSync(home)),
		};
		console.log(JSON.stringify({ probe: "F7-cancellation-writer", trace, cleanup: result }));
		expect(result.directoriesRemoved).toBe(true);
		expect(result.authorities.every((record) => record.exit !== null)).toBe(true);
		expect(native.every((record) => record.survivingPids.length === 0)).toBe(true);
	};
	return { create, execute, cleanup };
}
