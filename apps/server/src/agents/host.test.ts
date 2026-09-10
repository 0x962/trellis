import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, Project, TrellisEvent } from "@trellis/api";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { type FakeTimerClock, fakeTimerClock } from "../../test/helpers/clock.ts";
import { flagOf, type SupersetStubHandle, supersetStub } from "../../test/helpers/superset-stub.ts";
import type { InlineTransport } from "../db/transport.ts";
import type { AgentsHost } from "./host.ts";

// The agents host runs in the thread that owns the database. At start it
// marks the sessions whose terminal is gone, starts the manager of each
// enabled project, and watches those projects; each batch of the
// dispatcher wakes the manager once. A settings change starts or stops the
// watching. These tests use the inline transport, the fake superset, and a
// fake clock.

const MANAGER = "agent:manager-cde";
const TEXT_START = "trellis: ";

let t: TestApp;
let stub: SupersetStubHandle;
let clock: FakeTimerClock;
let host: AgentsHost;
let logs: string[];
let logged: Array<{ msg: string; fields: Record<string, unknown> | undefined }>;
const events: TrellisEvent[] = [];

beforeEach(async () => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
		projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
	});
	t = await createTestApp({ supersetBin: stub.bin });
	clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
	logs = [];
	logged = [];
	events.length = 0;
	t.bus.subscribe(({ event }) => void events.push(event));
});
afterEach(async () => {
	host.stop();
	await t.close();
	stub.restore();
});

const startHost = async () => {
	const log = (msg: string, fields?: Record<string, unknown>) => {
		logs.push(msg);
		logged.push({ msg, fields });
	};
	host = (t.transport as InlineTransport).startAgents({ clock, log });
	await host.start();
	return host;
};

const settingsFor = (project: Project, global: boolean) => ({
	runner: "superset",
	enabled: global,
	projects: [
		{
			projectId: project.id,
			enabled: true,
			supersetProjectId: null,
			baseBranch: "main",
			maxConcurrent: 3,
			removeWorkspaceOnDone: true,
		},
	],
});

const enable = async (global = true) => {
	const project = await t.seedProject();
	await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos: [{ owner: "acme", repo: "web" }] } });
	const put = await t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, global) });
	expect(put.status).toBe(200);
	return project;
};

const sessions = async (query = "project=CDE"): Promise<AgentSession[]> =>
	(await t.api(`/api/agents/sessions?${query}`, { actor: null })).body.sessions;

const comment = (body: string, actor?: string) =>
	t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body }, actor });

const sent = () => stub.state().terminals.flatMap((terminal) => terminal.sent);

describe("agents host", () => {
	test("while the global switch is off, nothing runs superset and no change is watched", async () => {
		await enable(false);
		await startHost();
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		expect(stub.calls()).toEqual([]);
		expect(host.dispatcher.watched()).toEqual([]);
	});

	test("at start the manager of each enabled project starts once, and a restart finds it", async () => {
		const project = await enable();
		await startHost();
		const [create] = stub.callsOf("ws create");
		expect(flagOf(create!, "--name")).toBe("CDE · manager");
		expect(flagOf(create!, "--branch")).toBe("trellis-cde-manager");
		const [manager] = await sessions();
		expect(manager).toMatchObject({ projectId: project.id, role: "manager", state: "starting", title: "CDE manager" });
		expect(manager!.openUrl).toBe(`superset://workspace/${manager!.workspaceId}`);
		expect(stub.terminal(manager!.terminalId!).title).toBe("CDE manager");
		expect(host.dispatcher.watched()).toEqual([project.id]);

		host.stop();
		await startHost();
		expect(stub.callsOf("ws create")).toHaveLength(2);
		expect(stub.state().terminals).toHaveLength(1);
		expect((await sessions()).map(({ id, state }) => ({ id, state }))).toEqual([{ id: manager!.id, state: "running" }]);
	});

	test("at start a session whose terminal exited or is gone becomes exited", async () => {
		await enable();
		await t.createTicket({ project: "CDE", title: "One" });
		stub.update((state) => {
			state.workspaces.push({
				id: "ws-b",
				name: "CDE-1",
				branch: "cde-1-one",
				projectId: "sp-web",
				baseBranch: "main",
				tag: "trellis-cde",
			});
			for (const [terminalId, exited] of [
				["t-live", false],
				["t-dead", true],
			] as const) {
				state.terminals.push({
					terminalId,
					workspaceId: "ws-b",
					label: "Terminal",
					title: "CDE-1",
					command: null,
					exited,
					sent: [],
				});
			}
		});
		for (const [role, terminalId] of [
			["builder", "t-live"],
			["reviewer", "t-dead"],
			["reviewer", "t-gone"],
		]) {
			const body = { role, project: "CDE", ticket: "CDE-1", workspaceId: "ws-b", terminalId, claudeSessionId: "c" };
			expect((await t.api("/api/agents/register", { method: "POST", body, actor: `agent:${role}-cde-1` })).status).toBe(
				200,
			);
		}
		await startHost();
		const states = (await sessions("ticket=CDE-1")).map(({ terminalId, state }) => [terminalId, state]);
		expect(states).toEqual([
			["t-live", "running"],
			["t-dead", "exited"],
			["t-gone", "exited"],
		]);
	});

	test("a batch wakes the manager once with the pointer, sets lastWokenAt, and emits agents.batch", async () => {
		const project = await enable();
		await startHost();
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await comment("Please add a test.");
		await clock.advance(10_000);
		expect(sent()).toEqual([
			"trellis: 2 changes in CDE (CDE-1 created by navid, CDE-1 commented by navid). Run: trellis agents inbox --project CDE",
		]);
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([
			{ type: "agents.batch", projectId: project.id, count: 2 },
		]);
		expect((await sessions())[0]!.lastWokenAt).not.toBeNull();

		await comment("I am on it.", MANAGER);
		await clock.advance(10_000);
		expect(sent()).toHaveLength(1);
	});

	test("a wake of an exited manager starts it again in its Claude session", async () => {
		await enable();
		await startHost();
		const [manager] = await sessions();
		const body = {
			role: "manager",
			project: "CDE",
			workspaceId: manager!.workspaceId,
			terminalId: manager!.terminalId,
			claudeSessionId: "c-1",
		};
		expect((await t.api("/api/agents/register", { method: "POST", body, actor: MANAGER })).status).toBe(200);
		stub.exit(manager!.terminalId!);
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		const [relaunch] = stub.callsOf("terminals create");
		expect(flagOf(relaunch!, "--command")).toContain("--resume 'c-1'");
		expect(flagOf(relaunch!, "--command")).toContain(TEXT_START);
		const [after] = await sessions();
		expect(after).toMatchObject({ id: manager!.id, state: "running" });
		expect(after!.terminalId).not.toBe(manager!.terminalId);
	});

	test("turning agents on in settings starts the manager and the watching; turning them off stops the waking", async () => {
		const project = await enable(false);
		await startHost();
		await t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, true) });
		await host.idle();
		expect(stub.callsOf("ws create")).toHaveLength(1);
		expect(host.dispatcher.watched()).toEqual([project.id]);

		await t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, false) });
		await host.idle();
		expect(host.dispatcher.watched()).toEqual([]);
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		expect(stub.callsOf("terminals send")).toEqual([]);
	});

	test("a wake the runner refuses is logged and emits no batch; the next batch wakes the manager", async () => {
		await enable();
		await startHost();
		stub.update((state) => {
			state.failures["terminals list"] = "Superset is not running";
		});
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		expect(logs).toContain("agents wake");
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([]);
		stub.update((state) => {
			delete state.failures["terminals list"];
		});
		await comment("Still there?");
		await clock.advance(10_000);
		expect(sent()).toHaveLength(1);
		expect(sent()[0]!.startsWith("trellis: 1 change in CDE")).toBe(true);
	});
});

const failStart = () =>
	stub.update((state) => {
		state.failures["ws create"] = "fatal: invalid reference: main";
	});

const clearFailures = () =>
	stub.update((state) => {
		state.failures = {};
	});

describe("agents host failures", () => {
	test("a manager start that fails keeps a failed manager with the superset message, logs it, and emits agents.session", async () => {
		failStart();
		const project = await enable();
		await startHost();
		const [manager] = await sessions();
		expect(manager).toMatchObject({ projectId: project.id, role: "manager", state: "failed", workspaceId: null });
		expect(manager!.error).toContain("superset ws create: fatal: invalid reference: main");
		const line = logged.find((entry) => entry.msg === "agents manager failed");
		expect(String(line?.fields?.error)).toContain("fatal: invalid reference: main");
		const emitted = events.flatMap((event) => (event.type === "agents.session" ? [event.session.state] : []));
		expect(emitted).toEqual(["failed"]);
		expect(host.dispatcher.watched()).toEqual([project.id]);
	});

	test("a batch for a project without a running manager starts the manager once, and a second failure updates the failed row", async () => {
		failStart();
		await enable();
		await startHost();
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		expect(stub.callsOf("ws create")).toHaveLength(2);
		expect((await sessions()).map(({ state }) => state)).toEqual(["failed"]);
		expect(JSON.stringify(logged)).not.toContain("No row matches");
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([]);
	});

	test("after the fix, the next batch starts the manager in the failed row", async () => {
		failStart();
		await enable();
		await startHost();
		const [failed] = await sessions();
		clearFailures();
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		const all = await sessions();
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ id: failed!.id, state: "starting", error: null });
		expect(all[0]!.workspaceId).not.toBeNull();
	});

	test("every settings save starts the manager of each enabled project, so a save after a fix recovers", async () => {
		failStart();
		const project = await enable();
		await startHost();
		clearFailures();
		await t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, true) });
		await host.idle();
		expect((await sessions()).map(({ state }) => state)).toEqual(["starting"]);
	});

	test("agents.overview lists the batches the dispatcher sent", async () => {
		const project = await enable();
		await startHost();
		await t.createTicket({ project: "CDE", title: "Fix login" });
		await clock.advance(10_000);
		const overview = (await t.api("/api/agents/overview", { actor: null })).body;
		expect(overview.batches).toEqual([
			{ at: clock.now().toISOString(), projectId: project.id, count: 1, text: sent()[0] },
		]);
	});
});

describe("agents host tabs", () => {
	// A builder reports itself through agents.register. An agent that never
	// registers still runs, and its tab shows its name, so the next start of
	// the host reads it as running.
	test("at start a starting session whose tab shows its name becomes running", async () => {
		await enable();
		await t.createTicket({ project: "CDE", title: "One" });
		await startHost();
		const started = await t.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-1" }, actor: MANAGER });
		expect(started.body).toMatchObject({ title: "CDE-1", state: "starting" });
		expect(stub.terminal(started.body.terminalId).title).toBe("CDE-1");

		host.stop();
		await startHost();
		expect((await sessions("ticket=CDE-1")).map(({ id, state }) => ({ id, state }))).toEqual([
			{ id: started.body.id, state: "running" },
		]);
	});
});
