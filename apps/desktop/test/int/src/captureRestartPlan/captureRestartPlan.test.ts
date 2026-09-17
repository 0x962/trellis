import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { captureRestartPlan } from "../../../../src/captureRestartPlan/captureRestartPlan.ts";

let directory: string;
let home: string;
let server: Server;
let sessions: Record<string, unknown>[];
const source = { root: "", manifest: { id: "a".repeat(64), protocol: 6, version: "0.0.0" } };
const target = { root: "", manifest: { id: "b".repeat(64), protocol: 6, version: "0.0.0" } };
const session = (id: string) => ({
	id,
	status: "running",
	controllable: true,
	process: { identity: `kernel-${id}` },
	agent: { sessionId: `provider-${id}`, model: "observed-model" },
	launch: { cwd: "/saved/work" },
});
const descriptor = async (id: string, harness = "codex", runId: string | undefined = `run-${id}`) => {
	const path = join(home, "harness-attempts", id);
	await mkdir(path, { recursive: true });
	await writeFile(
		join(path, "launch.json"),
		JSON.stringify({
			harness,
			effort: "ultra",
			fingerprint: JSON.stringify([harness, "/saved/work", "prompt", "configured-model"]),
			spec: { id, cwd: "/saved/work", env: { TRELLIS_RUN_ID: runId } },
		}),
	);
};
beforeEach(async () => {
	directory = await mkdtemp("/tmp/trl-plan-");
	home = join(directory, "home");
	source.root = join(directory, "release");
	await mkdir(join(home, "runtime"), { recursive: true });
	await mkdir(join(source.root, "bin"), { recursive: true });
	await mkdir(join(source.root, "packages"));
	await symlink(process.execPath, join(source.root, "bin/bun"));
	await symlink(
		resolve(originDir(import.meta.dir), "../../../../packages/runtime-protocol"),
		join(source.root, "packages/runtime-protocol"),
	);
	await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 6 }));
	sessions = [session("active"), { ...session("stopped"), status: "exited" }];
	server = createServer((socket) =>
		socket.once("data", (data) => {
			const request = JSON.parse(data.toString());
			socket.end(`${JSON.stringify({ id: request.id, result: sessions })}\n`);
		}),
	);
	await new Promise<void>((resolve) => server.listen(join(home, "runtime/runtime.sock"), resolve));
	await descriptor("active");
	await descriptor("stopped");
});
afterEach(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await rm(directory, { recursive: true, force: true });
});
test("capture saves only OS-confirmed active agents and fresh resume identities", async () => {
	await captureRestartPlan(home, source, target);
	const plan = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
	expect(plan).toMatchObject({ version: 1, sourceReleaseId: source.manifest.id, targetReleaseId: target.manifest.id });
	expect(plan.sessions).toHaveLength(1);
	expect(plan.sessions[0]).toMatchObject({
		runId: "run-active",
		previousAttemptId: "active",
		providerSessionId: "provider-active",
		harness: "codex",
		model: "observed-model",
		effort: "ultra",
		workspace: "/saved/work",
		processIdentity: "kernel-active",
	});
	expect(plan.sessions[0].attempt.id).not.toBe("active");
	expect(plan.sessions[0].attempt.token.length).toBeGreaterThan(20);
});
const largeSessions = () => {
	const active = session("active");
	const stopped = session("stopped");
	sessions = [
		{ ...active, launch: { ...active.launch, args: ["x".repeat(1_100_000)] } },
		{
			...stopped,
			status: "exited",
			agent: { ...stopped.agent, lastMessage: { text: "y".repeat(1_100_000), at: "2026-09-15T00:00:00.000Z" } },
		},
	];
	expect(Buffer.byteLength(JSON.stringify(sessions))).toBeLessThan(3_000_000);
};
test("large active launch arguments and retired metadata preserve only the active resume identity", async () => {
	largeSessions();
	await captureRestartPlan(home, source, target);
	const saved = await readFile(join(home, "restart-plan.json"), "utf8");
	const plan = JSON.parse(saved);
	expect(plan.sessions).toHaveLength(1);
	expect(plan.sessions[0]).toMatchObject({
		runId: "run-active",
		previousAttemptId: "active",
		providerSessionId: "provider-active",
		harness: "codex",
		model: "observed-model",
		effort: "ultra",
		workspace: "/saved/work",
		processIdentity: "kernel-active",
	});
	expect(Buffer.byteLength(saved)).toBeLessThan(2000);
});
test("large runtime metadata still records an unknown process as not saved", async () => {
	largeSessions();
	sessions[0]!.status = "unknown";
	await captureRestartPlan(home, source, target);
	const plan = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
	expect(plan.sessions).toHaveLength(1);
	expect(plan.sessions[0]).toMatchObject({
		runId: "run-active",
		previousAttemptId: "active",
		done: true,
		outcome: "failed",
		error: "Trellis cannot confirm which process owns terminal active (status unknown). It was not saved for resume.",
	});
});
test("a plan keeps the failed agents of the previous update beside the new live ones", async () => {
	await captureRestartPlan(home, source, target);
	const first = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
	first.sessions.push({
		...first.sessions[0],
		runId: "run-lost",
		previousAttemptId: "lost",
		error: "The previous process of this agent (attempt lost) is still unknown, not stopped.",
	});
	await writeFile(join(home, "restart-plan.json"), JSON.stringify(first));
	sessions = [session("fresh")];
	await descriptor("fresh");
	await captureRestartPlan(home, source, target);
	const plan = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
	expect(plan.id).not.toBe(first.id);
	expect(plan.sessions.map((entry: { runId: string }) => entry.runId).sort()).toEqual([
		"run-active",
		"run-fresh",
		"run-lost",
	]);
	expect(plan.sessions.find((entry: { runId: string }) => entry.runId === "run-lost")).toMatchObject({
		done: true,
		outcome: "failed",
		error: "The previous process of this agent (attempt lost) is still unknown, not stopped.",
	});
	expect(plan.sessions.find((entry: { runId: string }) => entry.runId === "run-active")).toMatchObject({
		attempt: first.sessions[0].attempt,
	});
});
test("capture preserves a pending plan after the runtime stops", async () => {
	await captureRestartPlan(home, source, target);
	const saved = await readFile(join(home, "restart-plan.json"), "utf8");
	await rm(join(home, "runtime/manifest.json"));
	await captureRestartPlan(home, source, target);
	expect(await readFile(join(home, "restart-plan.json"), "utf8")).toBe(saved);
});
test("a later package preserves the original pending resume identities", async () => {
	await captureRestartPlan(home, source, target);
	const saved = await readFile(join(home, "restart-plan.json"), "utf8");
	await captureRestartPlan(home, source, { ...target, manifest: { ...target.manifest, id: "c".repeat(64) } });
	expect(await readFile(join(home, "restart-plan.json"), "utf8")).toBe(saved);
});
test("capture retains the configured model when the provider has not reported one", async () => {
	sessions[0]!.agent = { sessionId: "provider-active", model: null };
	await captureRestartPlan(home, source, target);
	expect(JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8")).sessions[0].model).toBe(
		"configured-model",
	);
});
test("raw terminals without agent ownership do not become resumed agents", async () => {
	sessions = [{ ...session("raw"), agent: null }];
	await captureRestartPlan(home, source, target);
	expect(JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8")).sessions).toEqual([]);
});
for (const [name, change, error] of [
	[
		"unknown process",
		() => {
			sessions[0]!.status = "unknown";
		},
		"Trellis cannot confirm which process owns terminal active (status unknown). It was not saved for resume.",
	],
	[
		"uncontrolled process",
		() => {
			sessions[0]!.controllable = false;
		},
		"Trellis cannot confirm which process owns terminal active (status running). It was not saved for resume.",
	],
	[
		"missing provider session",
		() => {
			sessions[0]!.agent = null;
		},
		"Agent run-active has no confirmed provider session yet. It was not saved for resume.",
	],
	[
		"custom harness",
		() => descriptor("active", "custom"),
		"Agent run-active runs a custom harness, which cannot resume a conversation. It was not saved for resume.",
	],
	[
		"unknown assignment",
		() => descriptor("active", "codex", ""),
		"Terminal active has no saved agent assignment. It was not saved for resume.",
	],
] as const)
	test(`${name} is recorded as not saved and the update continues`, async () => {
		await change();
		await captureRestartPlan(home, source, target);
		const plan = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
		expect(plan.sessions).toHaveLength(1);
		expect(plan.sessions[0]).toMatchObject({ previousAttemptId: "active", done: true, outcome: "failed", error });
	});
