import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
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
			directory,
			ade: "native",
			harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
		},
	});
	const ticket = await t.createTicket({ project: "NAT", title: "Native work", status: "In Progress" });
	const persona = await t.client.personas.create({
		name: "Fixture",
		kind: "builder",
		instruction: "Read the fixture.",
	});
	const run = await t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id });
	expect(run).toMatchObject({ runtime: "native", state: "running", processStatus: "running" });
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
	const comment = await t.client.comments.create({ ticket: ticket.identifier, body: "@Fixture verify the ticket." });
	await t.transport.call("controller.dispatch", systemContext(), {});
	expect((await t.client.comments.thread({ id: comment.id })).root.notifications).toEqual([
		{ runId: run.id, personaName: "Fixture", state: "sent", error: null },
	]);
	let notified = "";
	for (let i = 0; i < 50 && !notified.includes(`trellis thread show ${comment.id}`); i++) {
		notified = (await t.client.agentRuns.output({ id: run.id })).text;
		await Bun.sleep(20);
	}
	expect(notified).toContain(`trellis thread show ${comment.id}`);

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
	const descriptor = JSON.parse(readFileSync(join(t.home, "harness-attempts", run.terminalId!, "launch.json"), "utf8"));
	await client.observe(run.terminalId!, descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN, {
		kind: "error",
		error: "Fixture provider failure",
		outcome: "failed",
	});
	expect((await t.client.agentRuns.list({ ticket: ticket.identifier }))[0]).toMatchObject({
		terminalId: run.terminalId,
		state: "failed",
		processStatus: "running",
	});
	await t.editServerTx((tx) =>
		tx.execute(sql`UPDATE projects SET manager_config=manager_config - 'ade' WHERE key='NAT'`),
	);
	expect(await t.client.system.stopNativeWork({})).toEqual({ stopped: 1 });
	expect((await t.client.projects.get({ project: "NAT" })).managerConfig).not.toHaveProperty("dispatchPaused");
	expect(
		await t.editServerTx(
			async (tx) =>
				(await tx.execute(sql`SELECT closed_at IS NOT NULL AS closed FROM agent_runs WHERE id=${run.id}`)).rows[0],
		),
	).toMatchObject({ closed: true });
	expect(await t.client.system.nativeWork({})).toEqual({ paused: true });
	await expect(t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(await t.client.system.resumeNativeWork({})).toEqual({ paused: false });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("native-probe");
	await t.client.agentRuns.stop({ id: run.id });
	expect((await t.client.agentRuns.list({ ticket: ticket.identifier }))[0]).toMatchObject({
		terminalId: run.terminalId,
		processStatus: null,
	});
	expect((await t.client.system.doctor({})).runtime.state).toBe("stopped");
}, 20000);
