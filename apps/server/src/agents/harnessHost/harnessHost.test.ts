import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { HarnessHost } from "./harnessHost.ts";

const at = new Date("2026-09-23T12:00:00Z");
const working = (step: number): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "test",
	pid: null,
	mode: "pty",
	status: "running",
	startedAt: at.toISOString(),
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: step,
	controllable: true,
	process: null,
	launch: { command: "claude", args: [], cwd: "/tmp" },
	// The harness reports one more tool every step and never reports a
	// provider session, which is the shape of the launch that hung.
	agent: {
		sessionId: null,
		model: null,
		turnId: null,
		tool: null,
		lastTool: {
			id: "tool",
			name: "Read",
			status: "running",
			error: null,
			startedAt: at.toISOString(),
			updatedAt: new Date(Date.now() + step * 1000).toISOString(),
		},
		lastMessage: null,
		error: null,
		outcome: null,
	},
	activity: { state: "working", updatedAt: at.toISOString() },
	acknowledgedMessageIds: [],
	result: null,
});

const busyRuntime = (): RuntimeClient =>
	({
		subscribeSession: async function* (_id: string, signal: AbortSignal) {
			for (let step = 1; !signal.aborted; step++) {
				yield { type: "session" as const, session: working(step) };
				await Bun.sleep(5);
			}
			throw Object.assign(new Error("aborted"), { name: "AbortError" });
		},
	}) as unknown as RuntimeClient;

// Every directory this file makes, so that a failed expectation in a test
// body still leaves none behind.
const made: string[] = [];
afterAll(async () => {
	for (const directory of made) await rm(directory, { recursive: true, force: true });
});

test("a harness that reports work without a provider session ends the launch at the limit", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-harness-host-test-"));
	made.push(directory);
	const spec = { id: "attempt", command: "claude", args: [], cwd: "/tmp", env: {} };
	await mkdir(join(directory, "attempt"), { recursive: true });
	await writeFile(
		join(directory, "attempt", "launch.json"),
		JSON.stringify({ fingerprint: "test", prompt: "Read the source", spec, harness: "claude" }),
	);
	const host = new HarnessHost({
		runtime: {
			...busyRuntime(),
			list: async () => ({ sessions: [], complete: true }),
			start: async () => {},
		} as unknown as RuntimeClient,
		directory,
		agentsDirectory: join(directory, "agents"),
		env: {},
		bun: process.execPath,
		observationTimeoutMs: 60,
		confirmationLimitMs: 200,
	});
	const started = Date.now();
	await expect(host.startPrepared("attempt")).rejects.toThrow("did not reach the awaited state within 200 ms");
	const elapsed = Date.now() - started;
	// The reports arrive every 5 ms and each one restarts the 60 ms idle
	// clock, so only the limit can end this wait.
	expect(elapsed).toBeGreaterThanOrEqual(190);
	expect(elapsed).toBeLessThan(1000);
});

test("the wait without a limit still ends on the idle clock", async () => {
	const quiet = new HarnessHost({
		runtime: {
			subscribeSession: async function* (_id: string, signal: AbortSignal) {
				yield { type: "session" as const, session: working(1) };
				while (!signal.aborted) await Bun.sleep(5);
				throw Object.assign(new Error("aborted"), { name: "AbortError" });
			},
		} as unknown as RuntimeClient,
		directory: "/tmp/harness-attempts",
		agentsDirectory: "/tmp/agents",
		env: {},
		bun: process.execPath,
		observationTimeoutMs: 60,
	});
	await expect(quiet.waitFor("attempt", (state) => state.agent?.sessionId != null)).rejects.toThrow(
		"made no observed progress for 60 ms",
	);
});
