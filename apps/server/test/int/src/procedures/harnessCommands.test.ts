import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let directory: string;
let personaId: string;
const commands = {
	start: 'printf \'%s\' \'{"workspaceId":"workspace","terminalId":"terminal"}\'',
	resume: 'printf \'%s\' \'{"workspaceId":"workspace","terminalId":"resumed"}\'',
	healthcheck: "cat {{projectDir}}/health.json",
	send: "printf '%s' {{text}} > {{projectDir}}/message.txt",
	output: "cat {{projectDir}}/message.txt",
	stop: "printf stopped > {{projectDir}}/stopped.txt",
	open: "printf 'https://example.com/agent'",
	recover: 'printf \'%s\' \'{"workspaceId":"workspace","terminalId":"recovered"}\'',
	projects: "printf '[]'",
};
beforeEach(async () => {
	directory = mkdtempSync(join(tmpdir(), "trellis-harness-"));
	writeFileSync(join(directory, "health.json"), JSON.stringify({ state: "running" }));
	writeFileSync(join(directory, "message.txt"), "Initial output");
	t = await createTestApp({ supersetBin: "/usr/bin/false" });
	await t.seedProject("CMD");
	await t.client.projects.setRepos({ project: "CMD", repos: [{ owner: "example", repo: "code" }] });
	personaId = (await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." })).id;
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const configure = (harnessCommands = commands) =>
	t.api("/api/projects/CMD", {
		method: "PATCH",
		body: { managerConfig: { personaId, concurrency: 3, directory, harnessCommands } },
	});

test("custom commands control every operation without Superset or tmux", async () => {
	expect((await configure()).status).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(run).toMatchObject({ state: "running", runtime: "commands", url: "https://example.com/agent" });
	const message = "Keep 'quotes', `backticks`, $(printf EXPANDED), and {{name}} literal.\nNext line.";
	await t.client.agentRuns.send({ id: run.id, text: message });
	expect(readFileSync(join(directory, "message.txt"), "utf8")).toBe(message);
	expect((await t.client.agentRuns.output({ id: run.id })).text).toBe(message);
	expect((await t.client.agentRuns.refresh({ id: run.id })).state).toBe("running");
	await t.client.agentRuns.stop({ id: run.id });
	expect(readFileSync(join(directory, "stopped.txt"), "utf8")).toBe("stopped");
	expect((await t.client.agentRuns.output({ id: run.id })).text).toBe(message);
	const resumed = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(resumed).toMatchObject({ id: run.id, workspaceId: "workspace", terminalId: "resumed", state: "running" });
	writeFileSync(join(directory, "health.json"), JSON.stringify({ state: "exited" }));
	expect((await t.client.agentRuns.refresh({ id: run.id })).state).toBe("exited");
});

test("a run keeps its commands after the project changes its preset", async () => {
	expect((await configure()).status).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(
		(await configure({ ...commands, send: "/usr/bin/false", output: "/usr/bin/false", stop: "/usr/bin/false" })).status,
	).toBe(200);
	await t.client.agentRuns.send({ id: run.id, text: "Original harness" });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toBe("Original harness");
	expect((await t.client.agentRuns.stop({ id: run.id })).state).toBe("stopped");
});

test("a manager starts a new session when its harness start command changes", async () => {
	expect((await configure()).status).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	await t.client.agentRuns.stop({ id: run.id });
	expect(
		(
			await configure({
				...commands,
				start: 'printf \'%s\' \'{"workspaceId":"new-workspace","terminalId":"new-terminal"}\'',
				resume: "/usr/bin/false",
			})
		).status,
	).toBe(200);
	const fresh = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(fresh.sessionId).not.toBe(run.sessionId);
	expect(fresh).toMatchObject({
		id: run.id,
		state: "running",
		workspaceId: "new-workspace",
		terminalId: "new-terminal",
	});
});

test("an interrupted start uses the recovery command and then the healthcheck", async () => {
	expect((await configure({ ...commands, start: "printf 'launch failed' >&2; exit 1" })).status).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(run).toMatchObject({ state: "interrupted", runtime: "commands" });
	expect(run.error).toContain("launch failed");
	expect(await t.client.agentRuns.refresh({ id: run.id })).toMatchObject({ state: "running", terminalId: "recovered" });
});

test("an invalid healthcheck reply preserves the state and exposes its error", async () => {
	expect((await configure()).status).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	writeFileSync(join(directory, "health.json"), JSON.stringify({ state: "banana" }));
	const refreshed = await t.client.agentRuns.refresh({ id: run.id });
	expect(refreshed.state).toBe("running");
	expect(refreshed.error).toContain("state");
});

test("a repository lookup failure permits another start after configuration changes", async () => {
	expect((await configure({ ...commands, start: "printf '%s' {{projectId}}" })).status).toBe(200);
	const failed = await t.client.agentRuns.start({ personaId, project: "CMD" });
	expect(failed.state).toBe("failed");
	expect((await configure()).status).toBe(200);
	expect((await t.client.agentRuns.start({ personaId, project: "CMD" })).state).toBe("running");
});

test("a local review sends one notification through the run's saved harness", async () => {
	expect(
		(await configure({ ...commands, send: "printf '%s\\n' {{text}} >> {{projectDir}}/notifications.txt" })).status,
	).toBe(200);
	const run = await t.client.agentRuns.start({ personaId, project: "CMD" });
	const review = await t.client.reviews.submit({
		pr: "example/code#91",
		requestId: "one-delivery",
		verdict: "changes_requested",
		body: "Fix the selected findings.",
		recipients: [run.id],
		drafts: [{ path: "a.ts", line: 1, body: "Fix." }],
	});
	const deliver = () =>
		t.transport.call(
			"reviews.deliverPending",
			{ actor: null, session: null, reqId: "review-notify", now: new Date() },
			{},
		);
	await Promise.all([deliver(), deliver()]);
	expect((await t.client.reviews.show({ id: review.id })).deliveries[0]?.state).toBe("sent");
	const text = readFileSync(join(directory, "notifications.txt"), "utf8");
	expect(text.match(/trellis: Review/g)).toHaveLength(1);
	expect(text).toContain(`trellis review show ${review.id} --json`);
	expect(text).toContain(`/reviews/example/code/91`);
});
