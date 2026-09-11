import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { addSession, failedSession, rootId, startError } from "../../test/agents";
import { createFakeServer } from "../../test/fake-server";
import { addActivity, findTicket, isoNow } from "../../test/fake-server/state";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const batchText = "trellis: 2 changes in CDE (CDE-42 created by navid). Run: trellis agents inbox --project CDE";

describe("routes/agents", () => {
	test("lists each project's sessions with their names and errors, the agent actions, and the batches", async () => {
		const server = createFakeServer();
		const failed = failedSession(server, "manager");
		addSession(server, { role: "builder" });
		const ticket = findTicket(server.state, "CDE-42")!;
		const row = {
			rootId: rootId(server),
			projectId: ticket.projectId,
			ticketId: ticket.id,
			action: "ticket.updated",
			field: "status",
			fromValue: "Todo",
			toValue: "In Progress",
			createdAt: isoNow(),
		};
		addActivity(server.state, { ...row, actor: { kind: "agent", name: "manager-cde" } });
		addActivity(server.state, { ...row, actor: { kind: "human", name: "navid" } });
		server.state.agentBatches.push({ at: isoNow(), projectId: rootId(server), count: 2, text: batchText });

		renderApp({ path: "/agents", actor: "navid", server });
		expect(await screen.findByRole("heading", { name: "Agents", level: 1 })).toBeDefined();
		const sessions = within(await screen.findByRole("region", { name: "CDE sessions" }));
		expect(sessions.getByText(startError)).toBeDefined();
		expect(sessions.getByText("Failed")).toBeDefined();
		// The fixtures name the manager Amara and the builder Kenji.
		expect(sessions.getByText("Amara")).toBeDefined();
		expect(sessions.getByText("Kenji")).toBeDefined();
		expect(document.getElementById(failed.id)).not.toBeNull();

		const actions = within(screen.getByRole("list", { name: "Agent actions" }));
		expect(actions.getAllByRole("listitem")).toHaveLength(1);
		expect(actions.getByText("CDE-42")).toBeDefined();
		expect(actions.getByText(/moved the ticket from Todo to In Progress/)).toBeDefined();

		const batches = within(screen.getByRole("list", { name: "Batches" }));
		expect(batches.getByText(batchText)).toBeDefined();
	});

	test("with no agents each section says so", async () => {
		renderApp({ path: "/agents", actor: "navid", server: createFakeServer() });
		expect(await screen.findByText("No agent sessions yet.")).toBeDefined();
		expect(screen.getByText("No agent actions yet.")).toBeDefined();
		expect(screen.getByText("No batches since the server started.")).toBeDefined();
	});
});
