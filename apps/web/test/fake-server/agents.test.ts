import { describe, expect, test } from "bun:test";
import { AgentRunnerProjectsOutputSchema, AgentSessionSchema } from "@trellis/api";
import { addSession, enableAgents, rootId } from "../agents";
import { createFakeServer, type FakeServer } from "./index";

// Every event the fake server emits after the call, oldest first.
const recordEvents = (server: FakeServer) => {
	const emitted: Array<{ type: string; data: unknown }> = [];
	const emit = server.bus.emit;
	server.bus.emit = ((type, data, scope) => {
		emitted.push({ type, data });
		emit(type, data, scope);
	}) as typeof emit;
	return emitted;
};

describe("fake server agents", () => {
	test("agents.settings starts off with no projects, and setSettings replaces the record", async () => {
		const server = createFakeServer();
		expect(await server.client.agents.settings()).toEqual({ runner: "superset", enabled: false, projects: [] });
		const stored = await enableAgents(server);
		expect(await server.client.agents.settings()).toEqual(stored);
		expect(stored.projects).toHaveLength(1);
	});

	test("agents.startBuilder answers RUNNER_UNAVAILABLE disabled while agents or the manager are off", async () => {
		const server = createFakeServer();
		const refused = { code: "RUNNER_UNAVAILABLE", data: { reason: "disabled" } };
		await expect(server.client.agents.startBuilder({ ticket: "CDE-42" })).rejects.toMatchObject(refused);
		await enableAgents(server, "CDE", { enabled: false });
		await expect(server.client.agents.startBuilder({ ticket: "CDE-42" })).rejects.toMatchObject(refused);
	});

	test("agents.startBuilder starts one builder per ticket and emits agents.session", async () => {
		const server = createFakeServer();
		await enableAgents(server);
		const emitted = recordEvents(server);
		const first = AgentSessionSchema.parse(await server.client.agents.startBuilder({ ticket: "CDE-42" }));
		expect(first).toMatchObject({ role: "builder", state: "starting", title: "CDE-42", projectId: rootId(server) });
		expect(first.openUrl).not.toBeNull();
		const again = await server.client.agents.startBuilder({ ticket: "CDE-42" });
		expect(again.id).toBe(first.id);
		const byTicket = await server.client.agents.sessions({ ticket: "CDE-42" });
		expect(byTicket.sessions.map((session) => session.id)).toEqual([first.id]);
		const byProject = await server.client.agents.sessions({ project: "CDE" });
		expect(byProject.sessions.map((session) => session.id)).toContain(first.id);
		expect(emitted.filter((event) => event.type === "agents.session")).toEqual([
			{ type: "agents.session", data: { session: first } },
		]);
	});

	test("agents.startBuilder at the project limit answers CONCURRENCY_LIMIT", async () => {
		const server = createFakeServer();
		await enableAgents(server, "CDE", { maxConcurrent: 1 });
		await server.client.agents.startBuilder({ ticket: "CDE-42" });
		await expect(server.client.agents.startBuilder({ ticket: "CDE-44" })).rejects.toMatchObject({
			code: "CONCURRENCY_LIMIT",
			data: { limit: 1, running: 1 },
		});
	});

	test("every runner call answers RUNNER_UNAVAILABLE missing while the runner is down", async () => {
		const server = createFakeServer();
		await enableAgents(server);
		server.state.runnerDown = "missing";
		const refused = { code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } };
		await expect(server.client.agents.startBuilder({ ticket: "CDE-42" })).rejects.toMatchObject(refused);
		await expect(server.client.agents.runnerProjects()).rejects.toMatchObject(refused);
	});

	test("agents.runnerProjects lists the runner's projects and matches a project by its repo", async () => {
		const server = createFakeServer();
		await server.client.projects.setRepos({
			project: "CDE",
			repos: [{ owner: "canary-technologies-corp", repo: "de" }],
		});
		const result = AgentRunnerProjectsOutputSchema.parse(await server.client.agents.runnerProjects());
		expect(result.projects.map((project) => project.name)).toEqual(["de", "trellis"]);
		expect(result.matches).toEqual([{ projectId: rootId(server), runnerProjectId: "sp-de" }]);
	});

	test("agents.stop stops a session and emits agents.session", async () => {
		const server = createFakeServer();
		const session = addSession(server, { role: "builder" });
		const emitted = recordEvents(server);
		const stopped = await server.client.agents.stop({ id: session.id });
		expect(stopped.state).toBe("stopped");
		expect(emitted).toEqual([{ type: "agents.session", data: { session: stopped } }]);
	});

	test("agents.wake sets the manager's last wake time and emits agents.session", async () => {
		const server = createFakeServer();
		await enableAgents(server);
		const manager = addSession(server, { role: "manager" });
		const emitted = recordEvents(server);
		const woken = await server.client.agents.wake({ project: "CDE", text: "trellis: 1 change in CDE" });
		expect(woken.id).toBe(manager.id);
		expect(woken.lastWokenAt).not.toBeNull();
		expect(emitted).toEqual([{ type: "agents.session", data: { session: woken } }]);
	});

	test("agents.startReviewer opens a reviewer in the builder's workspace", async () => {
		const server = createFakeServer();
		await enableAgents(server);
		const builder = await server.client.agents.startBuilder({ ticket: "CDE-42" });
		const reviewer = await server.client.agents.startReviewer({
			ticket: "CDE-42",
			prUrl: "https://github.com/canary-technologies-corp/de/pull/118",
		});
		expect(reviewer).toMatchObject({ role: "reviewer", title: "CDE-42 review", workspaceId: builder.workspaceId });
	});

	test("agents.register stores a session, and a second call for the same terminal updates it", async () => {
		const server = createFakeServer();
		const input = {
			role: "manager" as const,
			project: "CDE",
			workspaceId: "ws-m",
			terminalId: "term-m",
			claudeSessionId: "9b1f0c3e",
		};
		const first = await server.client.agents.register(input);
		const second = await server.client.agents.register({ ...input, claudeSessionId: "0c3e9b1f" });
		expect(second.id).toBe(first.id);
		expect(first).toMatchObject({ role: "manager", ticketId: null, state: "running" });
	});

	test("agents.inbox returns the rows after the cursor and advances it", async () => {
		const server = createFakeServer();
		const first = await server.client.agents.inbox({ project: "MRG", limit: 500 });
		expect(first.events.length).toBeGreaterThan(0);
		expect(first.more).toBe(false);
		expect(first.cursor).toBe(first.events.at(-1)!.id);
		const ticketIds = new Set(first.events.map((event) => event.ticketId).filter((id) => id !== null));
		expect(new Set(first.tickets.map((ticket) => ticket.id))).toEqual(ticketIds);
		const second = await server.client.agents.inbox({ project: "MRG" });
		expect(second.events).toEqual([]);
		expect(second.cursor).toBe(first.cursor);
	});
});
