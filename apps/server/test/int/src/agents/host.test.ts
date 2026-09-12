import { describe, expect, test } from "bun:test";
import { agentsHostHarness, MANAGER } from "../../../helpers/agentsHost.ts";
import { flagOf } from "../../../helpers/superset-stub.ts";

// The agents host runs in the thread that owns the database. At start it
// marks the sessions whose terminal is gone, starts the manager of each
// enabled project, and watches those projects; each batch of the
// dispatcher wakes the manager once. A settings change starts or stops the
// watching. These tests use the inline transport, the fake superset, and a
// fake clock.

const TEXT_START = "trellis: ";

const h = agentsHostHarness();
const { startHost, enable, sessions, comment, sent, events } = h;

describe("agents host", () => {
	test("while the global switch is off, nothing runs superset and no change is watched", async () => {
		await enable(false);
		await startHost();
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		expect(h.stub.calls()).toEqual([]);
		expect(h.host.dispatcher.watched()).toEqual([]);
	});

	test("at start the manager of each enabled project starts once, and a restart finds it", async () => {
		const project = await enable();
		await startHost();
		const [create] = h.stub.callsOf("ws create");
		expect(flagOf(create!, "--name")).toBe("CDE · manager");
		expect(flagOf(create!, "--branch")).toBe("trellis-cde-manager");
		const [manager] = await sessions();
		expect(manager).toMatchObject({ projectId: project.id, role: "manager", state: "starting", title: "CDE manager" });
		expect(manager!.openUrl).toBe(`superset://workspace/${manager!.workspaceId}`);
		expect(h.stub.terminal(manager!.terminalId!).title).toBe("CDE manager");
		expect(h.host.dispatcher.watched()).toEqual([project.id]);

		h.host.stop();
		await startHost();
		expect(h.stub.callsOf("ws create")).toHaveLength(2);
		expect(h.stub.state().terminals).toHaveLength(1);
		expect((await sessions()).map(({ id, state }) => ({ id, state }))).toEqual([{ id: manager!.id, state: "running" }]);
	});

	test("at start a session whose terminal exited or is gone becomes exited", async () => {
		await enable();
		await h.t.createTicket({ project: "CDE", title: "One" });
		h.stub.update((state) => {
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
			expect(
				(await h.t.api("/api/agents/register", { method: "POST", body, actor: `agent:${role}-cde-1` })).status,
			).toBe(200);
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
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await comment("Please add a test.");
		await h.clock.advance(10_000);
		expect(sent()).toEqual([
			"trellis: 2 changes in CDE (CDE-1 created by dana, CDE-1 commented by dana). Run: trellis list --project CDE --json",
		]);
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([
			{ type: "agents.batch", projectId: project.id, count: 2 },
		]);
		expect((await sessions())[0]!.lastWokenAt).not.toBeNull();

		await comment("I am on it.", MANAGER);
		await h.clock.advance(10_000);
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
		expect((await h.t.api("/api/agents/register", { method: "POST", body, actor: MANAGER })).status).toBe(200);
		h.stub.exit(manager!.terminalId!);
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		const [relaunch] = h.stub.callsOf("terminals create");
		expect(flagOf(relaunch!, "--command")).toContain("--resume 'c-1'");
		expect(flagOf(relaunch!, "--command")).toContain(TEXT_START);
		const [after] = await sessions();
		expect(after).toMatchObject({ id: manager!.id, state: "running" });
		expect(after!.terminalId).not.toBe(manager!.terminalId);
	});

	test("turning agents on in settings starts the manager and the watching; turning them off stops the waking", async () => {
		const project = await enable(false);
		await startHost();
		await h.t.api("/api/agents/settings", { method: "PUT", body: h.settingsFor(project, true) });
		await h.host.idle();
		expect(h.stub.callsOf("ws create")).toHaveLength(1);
		expect(h.host.dispatcher.watched()).toEqual([project.id]);

		await h.t.api("/api/agents/settings", { method: "PUT", body: h.settingsFor(project, false) });
		await h.host.idle();
		expect(h.host.dispatcher.watched()).toEqual([]);
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		expect(h.stub.callsOf("terminals send")).toEqual([]);
	});

	test("selecting a manager persona stops the legacy manager and its watcher", async () => {
		await enable();
		await startHost();
		const [legacy] = await sessions();
		h.stub.update((state) => {
			const terminal = state.terminals.find((item) => item.terminalId === legacy!.terminalId)!;
			state.terminals.push({ ...terminal, terminalId: "orphan-manager", title: "◐ CDE manager" });
		});
		const persona = await h.t.client.personas.create({
			name: "Project Manager",
			kind: "manager",
			instruction: "Manage this project.",
		});
		await h.t.client.projects.update({
			project: "CDE",
			managerConfig: { personaId: persona.id, concurrency: 3, directory: "" },
		});
		await h.host.idle();

		expect(h.host.dispatcher.watched()).toEqual([]);
		expect((await sessions())[0]).toMatchObject({ id: legacy!.id, state: "stopped" });
		expect(h.stub.callsOf("terminals close")).toHaveLength(2);
		expect(h.stub.state().terminals).toEqual([]);
		expect(h.stub.callsOf("ws create")).toHaveLength(1);
		h.stub.update((state) => {
			state.projects[0]!.repo = "https://github.com/acme/web";
		});
		const manager = await h.t.client.agentRuns.start({ personaId: persona.id, project: "CDE" });
		expect(manager).toMatchObject({ kind: "manager", state: "running" });
	});

	test("a configured manager persona prevents a legacy manager at boot", async () => {
		await enable();
		const persona = await h.t.client.personas.create({
			name: "Project Manager",
			kind: "manager",
			instruction: "Manage this project.",
		});
		await h.t.client.projects.update({
			project: "CDE",
			managerConfig: { personaId: persona.id, concurrency: 3, directory: "" },
		});
		await startHost();

		expect(h.stub.callsOf("ws create")).toEqual([]);
		expect(await sessions()).toEqual([]);
		expect(h.host.dispatcher.watched()).toEqual([]);
	});

	test("a wake the runner refuses is logged and emits no batch; the next batch wakes the manager", async () => {
		await enable();
		await startHost();
		h.stub.update((state) => {
			state.failures["terminals list"] = "Superset is not running";
		});
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		expect(h.logs).toContain("agents wake");
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([]);
		h.stub.update((state) => {
			delete state.failures["terminals list"];
		});
		await comment("Still there?");
		await h.clock.advance(10_000);
		expect(sent()).toHaveLength(1);
		expect(sent()[0]!.startsWith("trellis: 1 change in CDE")).toBe(true);
	});
});
