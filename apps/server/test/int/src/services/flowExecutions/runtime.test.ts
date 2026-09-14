import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FlowNode } from "@trellis/api";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ulid } from "ulid";
import { systemContext } from "../../../../../src/context.ts";
import { createTestApp, type TestApp } from "../../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let app: TestApp;
const paths: string[] = [];
const previousClaude = process.env.TRELLIS_CLAUDE_BIN;
afterEach(async () => {
	if (app) {
		await app.close();
		if (existsSync(join(app.home, "runtime", "runtime.sock")))
			await new RuntimeClient(join(app.home, "runtime", "runtime.sock")).shutdown();
		await Bun.sleep(50);
	}
	if (previousClaude === undefined) delete process.env.TRELLIS_CLAUDE_BIN;
	else process.env.TRELLIS_CLAUDE_BIN = previousClaude;
	for (const path of paths) rmSync(path, { recursive: true, force: true });
	paths.length = 0;
});
const node = (kind: FlowNode["kind"], title: string): FlowNode => ({
	id: ulid(),
	parentId: null,
	kind,
	title,
	personaId: null,
	instruction: `Complete ${title}`,
	parallel: false,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
});
test("a real runtime completes a flow through a gate and human decision", async () => {
	const directory = mkdtempSync("/tmp/flow-repo-");
	const home = mkdtempSync("/tmp/flow-host-");
	paths.push(directory, home);
	execFileSync("git", ["init", "-q", directory]);
	writeFileSync(join(directory, "README.md"), "Flow fixture\n");
	execFileSync("git", ["-C", directory, "add", "."]);
	execFileSync("git", [
		"-C",
		directory,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Fixture",
	]);
	process.env.TRELLIS_CLAUDE_BIN = resolve(import.meta.dir, "../../../../fixtures/nativeHarness/flowWorker.mjs");
	app = await createTestApp({ home });
	await app.seedProject("FLOW");
	await app.client.projects.update({
		project: "FLOW",
		managerConfig: {
			personaId: null,
			concurrency: 2,
			directory,
			ade: "native",
			trustedDirectory: true,
			harness: { preset: "claude" },
		},
	});
	const ticket = await app.createTicket({ project: "FLOW", title: "Native flow" });
	const persona = await app.client.personas.create({
		name: "Flow fixture",
		kind: "builder",
		instruction: "Finish the requested step.",
	});
	const flow = await app.client.flows.create({ name: "Runtime flow" });
	const first = node("agent", "First");
	const gate = node("gate", "Condition");
	const human = node("human", "Approve");
	const skipped = node("agent", "Unselected");
	const final = node("agent", "Final");
	const doc = await app.client.flows.save({
		flow: flow.id,
		nodes: [first, gate, human, skipped, final],
		edges: [
			[first.id, gate.id, "out"],
			[gate.id, human.id, "yes"],
			[gate.id, skipped.id, "no"],
			[human.id, final.id, "out"],
		].map(([fromNodeId, toNodeId, branch]) => ({
			id: ulid(),
			fromNodeId: fromNodeId!,
			toNodeId: toNodeId!,
			branch: branch as "out" | "yes" | "no",
		})),
	});
	let execution = await app.client.flowExecutions.start({
		flow: flow.id,
		ticket: ticket.identifier,
		defaultPersonaId: persona.id,
		requestId: randomUUID(),
		expectedVersion: doc.flow.version,
	});
	for (let i = 0; i < 10 && !execution.state.steps.some((step) => step.state === "waiting_human"); i++) {
		await app.transport.call("flowExecutions.reconcile", systemContext(), {});
		execution = await app.client.flowExecutions.get({ id: execution.id });
	}
	expect(execution.state.steps.find((step) => step.nodeId === skipped.id)?.state).toBe("skipped");
	const decision = execution.state.steps.find((step) => step.state === "waiting_human")!;
	expect(decision).toBeDefined();
	execution = await app.client.flowExecutions.decide({
		id: execution.id,
		key: decision.actionKey,
		approved: true,
		output: "Proceed",
		expectedRevision: execution.revision,
	});
	for (let i = 0; i < 10 && execution.state.status !== "succeeded"; i++) {
		await app.transport.call("flowExecutions.reconcile", systemContext(), {});
		execution = await app.client.flowExecutions.get({ id: execution.id });
	}
	expect(execution.state.status).toBe("succeeded");
	expect(execution.tasks).toHaveLength(3);
	await app.transport.call("flowExecutions.reconcile", systemContext(), {});
	const runs = await app.client.agentRuns.list({ ticket: ticket.identifier });
	expect(runs).toHaveLength(3);
	expect(runs.every((run) => run.state === "stopped")).toBe(true);
	for (const run of runs) {
		expect(readFileSync(join(run.workspaceId!, "flow-artifact.txt"), "utf8")).not.toBe("");
		expect((await app.client.agentRuns.harness({ id: run.id }))?.state).toBe("idle");
	}
	expect(
		(await new RuntimeClient(join(home, "runtime", "runtime.sock")).list()).every(
			(session) => session.status === "exited",
		),
	).toBe(true);
	await app.serverTx(assertStatusInvariant);
}, 30000);
test("cancel stops a claimed native flow without another launch", async () => {
	const directory = mkdtempSync("/tmp/flow-cancel-repo-");
	const home = mkdtempSync("/tmp/flow-cancel-host-");
	paths.push(directory, home);
	execFileSync("git", ["init", "-q", directory]);
	writeFileSync(join(directory, "README.md"), "Cancel fixture\n");
	execFileSync("git", ["-C", directory, "add", "."]);
	execFileSync("git", [
		"-C",
		directory,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Fixture",
	]);
	process.env.TRELLIS_CLAUDE_BIN = resolve(import.meta.dir, "../../../../fixtures/nativeHarness/flowWorker.mjs");
	app = await createTestApp({ home });
	await app.seedProject("CANCEL");
	await app.client.projects.update({
		project: "CANCEL",
		managerConfig: {
			personaId: null,
			concurrency: 2,
			directory,
			ade: "native",
			trustedDirectory: true,
			harness: { preset: "claude" },
		},
	});
	const ticket = await app.createTicket({ project: "CANCEL", title: "Cancel native flow" });
	const persona = await app.client.personas.create({
		name: "Cancel fixture",
		kind: "builder",
		instruction: "WAIT_FOREVER",
	});
	const flow = await app.client.flows.create({ name: "Canceled flow" });
	const doc = await app.client.flows.save({ flow: flow.id, nodes: [node("agent", "Wait")], edges: [] });
	let execution = await app.client.flowExecutions.start({
		flow: flow.id,
		ticket: ticket.identifier,
		defaultPersonaId: persona.id,
		requestId: randomUUID(),
		expectedVersion: doc.flow.version,
	});
	await app.transport.call("flowExecutions.reconcile", systemContext(), {});
	execution = await app.client.flowExecutions.get({ id: execution.id });
	expect(execution.tasks).toHaveLength(1);
	execution = await app.client.flowExecutions.cancel({ id: execution.id, expectedRevision: execution.revision });
	expect(execution.state.status).toBe("canceled");
	expect(execution.state.steps[0]?.needsStop).toBe(false);
	await app.transport.call("flowExecutions.reconcile", systemContext(), {});
	const sessions = await new RuntimeClient(join(home, "runtime", "runtime.sock")).list();
	expect(sessions).toHaveLength(1);
	expect(sessions[0]?.status).toBe("exited");
	await app.serverTx(assertStatusInvariant);
}, 20000);
