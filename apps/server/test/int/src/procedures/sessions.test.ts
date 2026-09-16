import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { HarnessSchema, type SessionDetail } from "@trellis/api";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
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

// A command that stays alive and echoes its input, so no test needs a
// real agent program.
const cat = { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" } as const;

test("a session is a scratch repository with a running agent, listed newest first, and a delete removes it", async () => {
	t = await createTestApp({ home: mkdtempSync("/tmp/trellis-session-home-") });
	const created = await t.api("/api/sessions", { method: "POST", body: { prompt: "Say hello.", harness: cat } });
	expect(created.status).toBe(201);
	const session = created.body as SessionDetail;
	expect(created.headers.get("location")).toBe(`/api/sessions/${session.id}`);
	expect(session.name).toMatch(/^[a-z]+-[a-z]+$/);
	expect(session.directory).toBe(join(t.home, "sessions", session.name));
	expect(session.harness).toEqual(HarnessSchema.parse(cat));
	expect(session.run).toMatchObject({
		id: session.runId,
		kind: "session",
		name: session.name,
		personaId: null,
		projectId: null,
		ticketId: null,
		instruction: "Say hello.",
		runtime: "native",
		workspaceId: session.directory,
		state: "running",
		processStatus: "running",
	});
	expect(
		execFileSync("git", ["-C", session.directory, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim(),
	).toBe("true");
	const { run: _run, ...row } = session;
	expect(await t.client.sessions.list({})).toEqual([row]);
	expect((await t.client.sessions.get({ id: session.id })).run.processStatus).toBe("running");
	expect((await t.client.agentRuns.list({})).map((run) => run.id)).toEqual([session.runId]);

	const named = await t.client.sessions.create({ name: "Fix the Widget!", prompt: "Fix it.", harness: cat });
	expect(named.name).toBe("fix-the-widget");
	const again = await t.client.sessions.create({ name: "fix the widget", prompt: "Fix it again.", harness: cat });
	expect(again.name).toBe("fix-the-widget-2");
	expect((await t.client.sessions.list({})).map((item) => item.name)).toEqual([
		"fix-the-widget-2",
		"fix-the-widget",
		session.name,
	]);

	await t.client.agentRuns.stop({ id: session.runId });
	expect((await t.client.sessions.get({ id: session.id })).run.processStatus).toBe("exited");
	const restarted = await t.client.sessions.start({ id: session.id });
	expect(restarted.run).toMatchObject({ state: "running", processStatus: "running", workspaceId: session.directory });
	expect(restarted.run.terminalId).not.toBe(session.run.terminalId);

	expect(await t.client.sessions.delete({ id: session.id })).toEqual({ id: session.id });
	expect(existsSync(session.directory)).toBe(false);
	await expect(t.client.sessions.get({ id: session.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
	const history = (await t.client.agentRuns.list({})).find((run) => run.id === session.runId)!;
	expect(history.processStatus).toBe("exited");
	for (const item of [named, again]) await t.client.sessions.delete({ id: item.id });
	expect(await t.client.sessions.list({})).toEqual([]);
});

test("a session name needs a letter or digit", async () => {
	t = await createTestApp();
	await expect(t.client.sessions.create({ name: "!!!", prompt: "Say hello.", harness: cat })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["name"] }] },
	});
	expect(await t.client.sessions.list({})).toEqual([]);
});
