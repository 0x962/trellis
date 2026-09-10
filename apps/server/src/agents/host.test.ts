import { describe, expect, test } from "bun:test";
import { agentsHostHarness, MANAGER_ACTOR } from "../../test/helpers/agentsHost.ts";
import { flagOf } from "../../test/helpers/superset-stub.ts";

// The agents host runs in the thread that owns the database. At start it
// marks the sessions whose terminal is gone, starts the manager of each
// enabled project, and watches those projects; each batch of the
// dispatcher wakes the manager once. A settings change starts or stops the
// watching. These tests use the inline transport, the fake superset, and a
// fake clock.

const a = agentsHostHarness();

const comment = (body: string, actor?: string) =>
	a.t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body }, actor });

describe("agents host", () => {
	test("while the global switch is off, nothing runs superset and no change is watched", async () => {
		await a.enable(false);
		await a.startHost();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await a.clock.advance(10_000);
		expect(a.stub.calls()).toEqual([]);
		expect(a.host.dispatcher.watched()).toEqual([]);
	});

	test("at start the manager of each enabled project starts once, and a restart finds it", async () => {
		const project = await a.enable();
		await a.startHost();
		const [create] = a.stub.callsOf("ws create");
		expect(flagOf(create!, "--name")).toBe("CDE · manager");
		expect(flagOf(create!, "--branch")).toBe("trellis-cde-manager");
		const [manager] = await a.sessions();
		expect(manager).toMatchObject({ projectId: project.id, role: "manager", state: "starting", title: "CDE manager" });
		expect(manager!.openUrl).toBe(`superset://workspace/${manager!.workspaceId}`);
		expect(a.stub.terminal(manager!.terminalId!).title).toBe("CDE manager");
		expect(a.host.dispatcher.watched()).toEqual([project.id]);

		a.host.stop();
		await a.startHost();
		expect(a.stub.callsOf("ws create")).toHaveLength(2);
		expect(a.stub.state().terminals).toHaveLength(1);
		expect((await a.sessions()).map(({ id, state }) => ({ id, state }))).toEqual([
			{ id: manager!.id, state: "running" },
		]);
	});

	test("at start a session whose terminal exited or is gone becomes exited", async () => {
		await a.enable();
		await a.t.createTicket({ project: "CDE", title: "One" });
		a.stub.update((state) => {
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
				(await a.t.api("/api/agents/register", { method: "POST", body, actor: `agent:${role}-cde-1` })).status,
			).toBe(200);
		}
		await a.startHost();
		const states = (await a.sessions("ticket=CDE-1")).map(({ terminalId, state }) => [terminalId, state]);
		expect(states).toEqual([
			["t-live", "running"],
			["t-dead", "exited"],
			["t-gone", "exited"],
		]);
	});

	test("a batch wakes the manager once with the pointer, sets lastWokenAt, and emits agents.batch", async () => {
		const project = await a.enable();
		await a.startHost();
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await comment("Please add a test.");
		await a.clock.advance(10_000);
		expect(a.sent()).toEqual([
			"trellis: 2 changes in CDE (CDE-1 created by navid, CDE-1 commented by navid). Run: trellis agents inbox --project CDE",
		]);
		expect(a.events.filter((event) => event.type === "agents.batch")).toEqual([
			{ type: "agents.batch", projectId: project.id, count: 2 },
		]);
		expect((await a.sessions())[0]!.lastWokenAt).not.toBeNull();

		await comment("I am on it.", MANAGER_ACTOR);
		await a.clock.advance(10_000);
		expect(a.sent()).toHaveLength(1);
	});

	test("a wake of an exited manager starts it again in its Claude session", async () => {
		await a.enable();
		await a.startHost();
		const [manager] = await a.sessions();
		const body = {
			role: "manager",
			project: "CDE",
			workspaceId: manager!.workspaceId,
			terminalId: manager!.terminalId,
			claudeSessionId: "c-1",
		};
		expect((await a.t.api("/api/agents/register", { method: "POST", body, actor: MANAGER_ACTOR })).status).toBe(200);
		a.stub.exit(manager!.terminalId!);
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await a.clock.advance(10_000);
		const [relaunch] = a.stub.callsOf("terminals create");
		expect(flagOf(relaunch!, "--command")).toContain("--resume 'c-1'");
		expect(flagOf(relaunch!, "--command")).toContain("trellis: ");
		const [after] = await a.sessions();
		expect(after).toMatchObject({ id: manager!.id, state: "running" });
		expect(after!.terminalId).not.toBe(manager!.terminalId);
	});

	test("turning agents on in settings starts the manager and the watching; turning them off stops the waking", async () => {
		const project = await a.enable(false);
		await a.startHost();
		await a.setSettings(project, true, null);
		await a.host.idle();
		expect(a.stub.callsOf("ws create")).toHaveLength(1);
		expect(a.host.dispatcher.watched()).toEqual([project.id]);

		await a.setSettings(project, false, null);
		await a.host.idle();
		expect(a.host.dispatcher.watched()).toEqual([]);
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await a.clock.advance(10_000);
		expect(a.stub.callsOf("terminals send")).toEqual([]);
	});

	test("a wake the runner refuses is logged and emits no batch; the next batch wakes the manager", async () => {
		await a.enable();
		await a.startHost();
		a.stub.update((state) => {
			state.failures["terminals list"] = "Superset is not running";
		});
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await a.clock.advance(10_000);
		expect(a.logs).toContain("agents wake");
		expect(a.events.filter((event) => event.type === "agents.batch")).toEqual([]);
		a.stub.update((state) => {
			delete state.failures["terminals list"];
		});
		await comment("Still there?");
		await a.clock.advance(10_000);
		expect(a.sent()).toHaveLength(1);
		expect(a.sent()[0]!.startsWith("trellis: 1 change in CDE")).toBe(true);
	});
});

// The heartbeat types PING into the manager's terminal on the project's
// interval, so a manager that is idle, stuck, or dead gets a turn while
// nothing changes. Every ping writes one row that the Agents page reads.
