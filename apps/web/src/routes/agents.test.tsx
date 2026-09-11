import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { addSession, isoNow } from "../../test/agents";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";
import { addActivity } from "../../test/rows";
import { createTestServer } from "../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

// The quiet window the dispatcher waits before it sends a batch.
const QUIET_MS = 10_000;

describe("routes/agents", () => {
	// TRL-39. The page reads agentRuns.list, the query the ticket rail uses,
	// so an agent a person started shows here as well.
	test("lists each project's agent runs with their persona, state, and ticket", async () => {
		const server = createTestServer();
		const builder = await server.client.personas.create({
			name: "Feature Builder",
			kind: "builder",
			instruction: "Build.",
		});
		const reviewer = await server.client.personas.create({
			name: "Code Clarity",
			kind: "reviewer",
			instruction: "Review.",
		});
		const first = await server.client.agentRuns.start({ personaId: builder.id, ticket: "CDE-42" });
		const second = await server.client.agentRuns.start({ personaId: reviewer.id, ticket: "CDE-44" });
		const row = {
			ticket: "CDE-42",
			action: "ticket.updated",
			field: "status",
			fromValue: "Todo",
			toValue: "In Progress",
			createdAt: isoNow(),
		};
		await addActivity(server, { ...row, actor: { kind: "agent", name: "manager-cde" } });
		await addActivity(server, { ...row, actor: { kind: "human", name: "dana" } });

		renderApp({ path: "/agents", actor: "dana", server });
		expect(await screen.findByRole("heading", { name: "Agents", level: 1 })).toBeDefined();
		// The seed puts CDE-42 and CDE-44 in the same sub-project, so both runs
		// land in one group. The group is named for the path the run carries.
		expect(first.projectPath).toBe(second.projectPath);
		const sessions = within(await screen.findByRole("region", { name: `${first.projectPath} sessions` }));
		expect(await sessions.findByText(first.name)).toBeDefined();
		expect(sessions.getByText(second.name)).toBeDefined();
		expect(sessions.getByText("Feature Builder · builder")).toBeDefined();
		expect(sessions.getByText("Code Clarity · reviewer")).toBeDefined();
		expect(sessions.getByText("CDE-42")).toBeDefined();
		expect(sessions.getByText("CDE-44")).toBeDefined();
		expect(sessions.getAllByText("Running").length).toBe(2);
		// A failed agent links to /agents#<run id>, so the row carries the id.
		expect(document.getElementById(first.id)).not.toBeNull();
		expect(document.getElementById(second.id)).not.toBeNull();

		const actions = within(screen.getByRole("list", { name: "Agent actions" }));
		expect(actions.getAllByRole("listitem")).toHaveLength(1);
		expect(actions.getByText("CDE-42")).toBeDefined();
		expect(actions.getByText(/moved the ticket from Todo to In Progress/)).toBeDefined();
	});

	// TRL-39. The legacy agent_sessions rows are not the source any more, so
	// a stored session alone leaves the Sessions list empty.
	test("a legacy agent session is not an agent run", async () => {
		const server = createTestServer();
		await addSession(server, { role: "builder" });
		renderApp({ path: "/agents", actor: "dana", server });
		expect(await screen.findByText("No agent sessions yet.")).toBeDefined();
		expect(screen.queryByText("Kenji")).toBeNull();
	});

	// The batches come from the dispatcher of the running agents host, so the
	// list holds what a manager was woken with.
	test("lists the batches the dispatcher sent", async () => {
		const server = createTestServer();
		const { clock, host } = await server.startAgents();
		const project = await server.client.projects.get({ project: "CDE" });
		await server.client.agents.setSettings({
			runner: "superset",
			enabled: true,
			projects: [
				{
					projectId: project.id,
					enabled: true,
					supersetProjectId: null,
					baseBranch: null,
					maxConcurrent: 3,
					removeWorkspaceOnDone: true,
				},
			],
		});
		// The host watches the project after the settings change lands.
		await host.idle();
		await server.client.tickets.create({ project: "CDE", title: "A change the manager hears about" });
		await clock.advance(QUIET_MS);

		renderApp({ path: "/agents", actor: "dana", server });
		const batches = within(await screen.findByRole("list", { name: "Batches" }));
		expect((await batches.findAllByRole("listitem")).length).toBeGreaterThan(0);
		expect(batches.getByText(/1 change in CDE/)).toBeDefined();
		expect(batches.getByText(/trellis list --project CDE --json/)).toBeDefined();
	});

	// TRL-39. Actions and batches have no agent-run source, so each empty
	// state names what it can still hold.
	test("with no agents each section says so and names why", async () => {
		renderApp({ path: "/agents", actor: "dana", server: createTestServer() });
		expect(await screen.findByText("No agent sessions yet.")).toBeDefined();
		expect(screen.getByText("No agent actions yet.")).toBeDefined();
		expect(screen.getByText(/holds the manager, builder, and reviewer agents that trellis itself runs/)).toBeDefined();
		expect(screen.getByText("No batches since the server started.")).toBeDefined();
		expect(screen.getByText(/dispatcher wakes a manager that trellis itself runs/)).toBeDefined();
	});
});
