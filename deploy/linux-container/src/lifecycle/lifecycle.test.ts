import { expect, test } from "bun:test";
import { ContainerLifecycle, type ManagedProcess } from "./index.ts";
import type { ContainerLogEntry } from "../logger/index.ts";

test("restarts the host without a runtime restart and marks an explicit full stop", async () => {
	const processes: Record<"runtime" | "host", FakeProcess[]> = { runtime: [], host: [] };
	const states: unknown[] = [];
	const logs: ContainerLogEntry[] = [];
	let replacementReady = false;
	let exitCode: number | null = null;
	const lifecycle = new ContainerLifecycle({
		spawn: (service) => {
			const child = new FakeProcess(service === "runtime" ? 10 : 20 + processes.host.length);
			processes[service].push(child);
			return child;
		},
		waitForRuntime: async () => {},
		writeState: async (state) => {
			states.push(state);
		},
		markReplacementReady: async () => {
			replacementReady = true;
		},
		log: (entry) => logs.push(entry),
		exit: (code) => {
			exitCode = code;
		},
	});
	await lifecycle.start();
	await lifecycle.restartHost();
	expect(processes.runtime).toHaveLength(1);
	expect(processes.host).toHaveLength(2);
	expect(processes.host[0]?.signals).toEqual(["SIGTERM"]);
	await lifecycle.stopForReplacement();
	expect(processes.runtime[0]?.signals).toEqual(["SIGTERM"]);
	expect(processes.host[1]?.signals).toEqual(["SIGTERM"]);
	expect(replacementReady).toBe(true);
	expect(exitCode).toBe(0);
	expect(states).toHaveLength(3);
	expect(logs.map(({ event }) => event)).toContain("host_restart_completed");
	expect(logs.map(({ event }) => event)).toContain("replacement_stop_completed");
});

test("refuses replacement when the runtime does not stop cleanly", async () => {
	const processes: Record<"runtime" | "host", FakeProcess[]> = { runtime: [], host: [] };
	let replacementReady = false;
	let exitCode: number | null = null;
	const lifecycle = new ContainerLifecycle({
		spawn: (service) => {
			const child = new FakeProcess(service === "runtime" ? 10 : 20, service === "runtime" ? 1 : 0);
			processes[service].push(child);
			return child;
		},
		waitForRuntime: async () => {},
		writeState: async () => {},
		markReplacementReady: async () => {
			replacementReady = true;
		},
		log: () => {},
		exit: (code) => {
			exitCode = code;
		},
	});
	await lifecycle.start();
	await expect(lifecycle.stopForReplacement()).rejects.toThrow("runtime stopped with exit code 1");
	expect(replacementReady).toBe(false);
	expect(exitCode).toBeNull();
});

class FakeProcess implements ManagedProcess {
	readonly signals: NodeJS.Signals[] = [];
	private finish!: (code: number) => void;
	readonly exited = new Promise<number>((resolve) => {
		this.finish = resolve;
	});

	constructor(
		readonly pid: number,
		private readonly exitCode = 0,
	) {}

	kill(signal: NodeJS.Signals) {
		this.signals.push(signal);
		this.finish(this.exitCode);
	}
}
