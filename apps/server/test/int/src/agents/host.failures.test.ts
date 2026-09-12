import { describe, expect, test } from "bun:test";
import { agentsHostHarness, MANAGER } from "../../../helpers/agentsHost.ts";

// What the host does when the runner refuses a manager start, and how a
// session reaches the running state without a register.

const h = agentsHostHarness();
const { startHost, enable, sessions, sent, events } = h;

const failStart = () =>
	h.stub.update((state) => {
		state.failures["ws create"] = "fatal: invalid reference: main";
	});

const clearFailures = () =>
	h.stub.update((state) => {
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
		const line = h.logged.find((entry) => entry.msg === "agents manager failed");
		expect(String(line?.fields?.error)).toContain("fatal: invalid reference: main");
		const emitted = events.flatMap((event) => (event.type === "agents.session" ? [event.session.state] : []));
		expect(emitted).toEqual(["failed"]);
		expect(h.host.dispatcher.watched()).toEqual([project.id]);
	});

	test("a batch for a project without a running manager starts the manager once, and a second failure updates the failed row", async () => {
		failStart();
		await enable();
		await startHost();
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		expect(h.stub.callsOf("ws create")).toHaveLength(2);
		expect((await sessions()).map(({ state }) => state)).toEqual(["failed"]);
		expect(JSON.stringify(h.logged)).not.toContain("No row matches");
		expect(events.filter((event) => event.type === "agents.batch")).toEqual([]);
	});

	test("after the fix, the next batch starts the manager in the failed row", async () => {
		failStart();
		await enable();
		await startHost();
		const [failed] = await sessions();
		clearFailures();
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
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
		await h.t.api("/api/agents/settings", { method: "PUT", body: h.settingsFor(project, true) });
		await h.host.idle();
		expect((await sessions()).map(({ state }) => state)).toEqual(["starting"]);
	});

	test("agents.overview lists the batches the dispatcher sent", async () => {
		const project = await enable();
		await startHost();
		await h.t.createTicket({ project: "CDE", title: "Fix login" });
		await h.clock.advance(10_000);
		const overview = (await h.t.api("/api/agents/overview", { actor: null })).body;
		expect(overview.batches).toEqual([
			{ at: h.clock.now().toISOString(), projectId: project.id, count: 1, text: sent()[0] },
		]);
	});
});

describe("agents host tabs", () => {
	// A builder reports itself through agents.register. An agent that never
	// registers still runs, and its tab shows its name, so the next start of
	// the host reads it as running.
	test("at start a starting session whose tab shows its name becomes running", async () => {
		await enable();
		await h.t.createTicket({ project: "CDE", title: "One" });
		await startHost();
		const started = await h.t.api("/api/agents/builder", { method: "POST", body: { ticket: "CDE-1" }, actor: MANAGER });
		expect(started.body).toMatchObject({ title: "CDE-1", state: "starting" });
		expect(h.stub.terminal(started.body.terminalId).title).toBe("CDE-1");

		h.host.stop();
		await startHost();
		expect((await sessions("ticket=CDE-1")).map(({ id, state }) => ({ id, state }))).toEqual([
			{ id: started.body.id, state: "running" },
		]);
	});
});
