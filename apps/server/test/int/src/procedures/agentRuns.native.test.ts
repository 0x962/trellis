import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { systemContext } from "../../../../src/context.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	if (t !== undefined && existsSync(join(t.home, "runtime", "runtime.sock"))) {
		const client = new RuntimeClient(join(t.home, "runtime", "runtime.sock"));
		process.kill((await client.hello()).pid, "SIGTERM");
	}
	if (t !== undefined) {
		await t.serverTx((tx) => assertStatusInvariant(tx));
		await t.close();
	}
});

test("native agents use an isolated Git worktree and retain output after stop", async () => {
	const directory = mkdtempSync(join(tmpdir(), "trellis-native-repo-"));
	execFileSync("git", ["init", "-q", directory]);
	writeFileSync(join(directory, "README.md"), "native runtime fixture\n");
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
	t = await createTestApp({ home: mkdtempSync("/tmp/trellis-native-home-") });
	await t.seedProject("NAT");
	await t.client.projects.update({
		project: "NAT",
		managerConfig: {
			personaId: null,
			concurrency: 3,
			directory,
			ade: "native",
			supersetHostId: null,
			adeCommand: "",
			adeResumeCommand: "",
			adeCommands: null,
			harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
		},
	});
	const ticket = await t.createTicket({ project: "NAT", title: "Native work" });
	const persona = await t.client.personas.create({
		name: "Fixture",
		kind: "builder",
		instruction: "Read the fixture.",
	});
	const run = await t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id });
	expect(run).toMatchObject({ runtime: "native", state: "running" });
	expect(run.workspaceId).not.toBe(directory);
	expect(
		execFileSync("git", ["-C", run.workspaceId!, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim(),
	).toBe("true");
	const client = new RuntimeClient(join(t.home, "runtime", "runtime.sock"));
	expect((await client.list()).filter((session) => session.status === "running")).toHaveLength(1);
	expect(await t.client.agentRuns.session({ id: run.id })).toMatchObject({
		id: run.terminalId,
		mode: "pty",
		status: "running",
	});
	await expect(
		t.client.agentRuns.terminalInput({ id: run.id, expectedTerminalId: "old-attempt", text: "wrong-target\r" }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: {
			issues: [
				{
					path: ["id"],
					message:
						"The agent session changed after this delivery was queued. Inspect the current session before a resend.",
				},
			],
		},
	});
	await t.client.agentRuns.resize({ id: run.id, cols: 90, rows: 28 });
	await t.client.agentRuns.terminalInput({ id: run.id, text: "native-probe\r" });
	let output = "";
	for (let i = 0; i < 50 && !output.includes("native-probe"); i++) {
		output = (await t.client.agentRuns.output({ id: run.id })).text;
		await Bun.sleep(20);
	}
	expect(output).toContain("native-probe");
	const bytes = await t.client.agentRuns.terminalOutput({ id: run.id, offset: 0 });
	expect(Buffer.from(bytes.data, "base64").toString()).toContain("native-probe");
	expect((await t.client.agentRuns.terminalOutput({ id: run.id, offset: bytes.nextOffset })).startOffset).toBe(
		bytes.nextOffset,
	);
	expect(await t.client.controller.list({})).toEqual([]);
	const denied = await t.api(`/api/tickets/${ticket.identifier}`, {
		method: "PATCH",
		actor: `agent:${run.id}`,
		body: { title: "Stale write" },
	});
	expect(denied.status).toBe(400);
	expect(denied.body.code).toBe("INPUT_VALIDATION_FAILED");
	expect((await t.client.tickets.get({ ticket: ticket.identifier })).title).toBe("Native work");
	const deniedInput = await t.api(`/api/agent-runs/${run.id}/terminal/input`, {
		method: "POST",
		actor: `agent:${run.id}`,
		body: { text: "stale-input\r" },
	});
	expect(deniedInput.status).toBe(400);
	expect(await t.client.system.stopNativeWork({})).toEqual({ stopped: 1 });
	expect((await t.client.agentRuns.list({ ticket: ticket.identifier }))[0]?.state).toBe("stopped");
	expect(await t.client.system.nativeWork({})).toEqual({ paused: true });
	await expect(t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(await t.client.system.resumeNativeWork({})).toEqual({ paused: false });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("native-probe");
	await t.client.agentRuns.stop({ id: run.id });
	expect((await t.client.system.doctor({})).runtime.state).toBe("stopped");
}, 20000);

test("a structured native agent requires trust and exposes tool approval", async () => {
	const directory = mkdtempSync("/tmp/trellis-harness-repo-");
	execFileSync("git", ["init", "-q", directory]);
	writeFileSync(join(directory, "README.md"), "Harness fixture\n");
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
	t = await createTestApp({ home: mkdtempSync("/tmp/trellis-harness-home-") });
	await t.seedProject("HAR");
	const config = {
		personaId: null,
		concurrency: 3,
		directory,
		ade: "native" as const,
		harness: { preset: "claude" as const },
	};
	await t.client.projects.update({ project: "HAR", managerConfig: config });
	const ticket = await t.createTicket({ project: "HAR", title: "Harness work" });
	const persona = await t.client.personas.create({
		name: "Harness fixture",
		kind: "builder",
		instruction: "Complete the fixture.",
	});
	const untrusted = await t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id });
	expect(untrusted.state).toBe("failed");
	expect(untrusted.error).toContain("Trust this repository");
	await expect(
		t
			.as("agent:another-agent")
			.projects.update({ project: "HAR", managerConfig: { ...config, trustedDirectory: true } }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await t.client.projects.update({ project: "HAR", managerConfig: { ...config, trustedDirectory: true } });
	const previous = process.env.TRELLIS_CLAUDE_BIN;
	process.env.TRELLIS_CLAUDE_BIN = new URL(
		"../../../fixtures/nativeHarness/claudeFixture.mjs",
		import.meta.url,
	).pathname;
	try {
		const run = await t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id });
		expect(run.state).toBe("running");
		expect(await t.client.agentRuns.session({ id: run.id })).toMatchObject({ mode: "stdio" });
		let observed = await t.client.agentRuns.harness({ id: run.id });
		for (let i = 0; i < 50 && observed?.state !== "idle"; i++) {
			await Bun.sleep(20);
			observed = await t.client.agentRuns.harness({ id: run.id });
		}
		expect(observed?.state).toBe("idle");
		expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Fixture turn completed.");
		await t.client.agentRuns.send({ id: run.id, text: "request tool" });
		expect((await t.client.agentRuns.harness({ id: run.id }))?.state).toBe("needs_input");
		await expect(
			t.as(`agent:${run.id}`).agentRuns.permission({ id: run.id, requestId: "fixture-permission", behavior: "allow" }),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		await t.client.agentRuns.permission({ id: run.id, requestId: "fixture-permission", behavior: "allow" });
		for (let i = 0; i < 50 && (await t.client.agentRuns.harness({ id: run.id }))?.state !== "idle"; i++)
			await Bun.sleep(20);
		expect(readFileSync(join(run.workspaceId!, "artifact.txt"), "utf8")).toBe("Fixture output\n");
		await t.client.evidence.register({ runId: run.id, path: "artifact.txt" });
		const checked = await t.client.evidence.check({
			runId: run.id,
			command: "/usr/bin/true",
			args: [],
			timeoutMs: 1000,
		});
		expect(checked.state).toBe("passed");
		expect((await t.client.evidence.list({ runId: run.id })).readyForReview).toBe(true);
		writeFileSync(join(run.workspaceId!, "artifact.txt"), "Changed after the check\n");
		expect((await t.client.evidence.list({ runId: run.id })).readyForReview).toBe(false);
		await t.transport.call("agentRuns.reconcileNative", systemContext(), {});
		const runtime = new RuntimeClient(join(t.home, "runtime", "runtime.sock"));
		process.kill((await runtime.hello()).pid, "SIGTERM");
		for (let i = 0; i < 100 && existsSync(join(t.home, "runtime", "runtime.sock")); i++) await Bun.sleep(20);
		expect((await t.client.agentRuns.harness({ id: run.id }))?.result).toBe("Artifact created.");
		expect((await t.client.agentRuns.harness({ id: run.id }))?.state).toBe("unknown");
		await t.client.agentRuns.stop({ id: run.id });
		const retained = (await t.client.agentRuns.output({ id: run.id })).text;
		expect(retained).toContain("Artifact created.");
		expect(retained).not.toContain('"type":"control_response"');
	} finally {
		if (previous === undefined) delete process.env.TRELLIS_CLAUDE_BIN;
		else process.env.TRELLIS_CLAUDE_BIN = previous;
	}
}, 20000);
