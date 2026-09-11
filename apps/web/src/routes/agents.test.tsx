import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { addSession, failedSession, isoNow, startError } from "../../test/agents";
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
	test("lists each project's sessions with their errors and the agent actions", async () => {
		const server = createTestServer();
		const failed = await failedSession(server, "manager");
		await addSession(server, { role: "builder" });
		const row = {
			ticket: "CDE-42",
			action: "ticket.updated",
			field: "status",
			fromValue: "Todo",
			toValue: "In Progress",
			createdAt: isoNow(),
		};
		await addActivity(server, { ...row, actor: { kind: "agent", name: "manager-cde" } });
		await addActivity(server, { ...row, actor: { kind: "human", name: "navid" } });

		renderApp({ path: "/agents", actor: "navid", server });
		expect(await screen.findByRole("heading", { name: "Agents", level: 1 })).toBeDefined();
		const sessions = within(await screen.findByRole("region", { name: "CDE sessions" }));
		expect(sessions.getByText(startError)).toBeDefined();
		expect(sessions.getByText("Failed")).toBeDefined();
		expect(sessions.getAllByRole("link", { name: "Open in Superset" })).toHaveLength(1);
		expect(document.getElementById(failed.id)).not.toBeNull();

		const actions = within(screen.getByRole("list", { name: "Agent actions" }));
		expect(actions.getAllByRole("listitem")).toHaveLength(1);
		expect(actions.getByText("CDE-42")).toBeDefined();
		expect(actions.getByText(/moved the ticket from Todo to In Progress/)).toBeDefined();
	});

	// The batches come from the dispatcher of the running agents host, so the
	// list holds what a manager was woken with.
	test("lists the batches the dispatcher sent", async () => {
		const server = createTestServer();
		const { clock } = await server.startAgents();
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
		await server.client.tickets.create({ project: "CDE", title: "A change the manager hears about" });
		await clock.advance(QUIET_MS);

		renderApp({ path: "/agents", actor: "navid", server });
		const batches = within(await screen.findByRole("list", { name: "Batches" }));
		expect((await batches.findAllByRole("listitem")).length).toBeGreaterThan(0);
		expect(batches.getByText(/1 change in CDE/)).toBeDefined();
		expect(batches.getByText(/trellis agents inbox --project CDE/)).toBeDefined();
	});

	test("with no agents each section says so", async () => {
		renderApp({ path: "/agents", actor: "navid", server: createTestServer() });
		expect(await screen.findByText("No agent sessions yet.")).toBeDefined();
		expect(screen.getByText("No agent actions yet.")).toBeDefined();
		expect(screen.getByText("No batches since the server started.")).toBeDefined();
	});
});
