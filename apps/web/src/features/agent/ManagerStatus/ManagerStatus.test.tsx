import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addSession, enableAgents, failedSession, startReason } from "../../../../test/agents";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { ago, minute } from "../../../../test/ticketHost";
import { ManagerStatus } from "./ManagerStatus";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = async (server: TestServer, ref = "CDE") => {
	const project = await server.client.projects.get({ project: ref });
	return renderWithProviders(<ManagerStatus project={project} />, { path: `/p/${ref}`, actor: "dana", server });
};

const status = () => screen.findByRole("group", { name: "Manager" });

describe("ManagerStatus", () => {
	test("shows nothing when the project has no manager", async () => {
		await mount(createTestServer());
		await waitFor(() => expect(screen.queryByRole("group", { name: "Manager" })).toBeNull());
	});

	test("shows nothing for a manager that runs", async () => {
		const server = createTestServer();
		await addSession(server, { role: "manager", lastWokenAt: ago(3 * minute), openUrl: "superset://workspace/ws-m" });
		await mount(server);
		await waitFor(() => expect(screen.queryByRole("group", { name: "Manager" })).toBeNull());
		expect(screen.queryByText(/Last batch/)).toBeNull();
		expect(screen.queryByRole("link", { name: "Open in Superset" })).toBeNull();
	});

	test("a failed manager reads Manager failed with the short reason and links the full error", async () => {
		const server = createTestServer();
		const failed = await failedSession(server, "manager");
		await mount(server);
		const group = within(await status());
		expect(await group.findByText(`Manager failed: ${startReason}`)).toBeDefined();
		expect(group.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/agents#${failed.id}`);
	});

	test("Retry starts the failed manager again, and the header clears", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await enableAgents(server);
		await failedSession(server, "manager");
		await mount(server);
		const group = within(await status());
		await user.click(await group.findByRole("button", { name: "Retry" }));
		await waitFor(() =>
			expect(server.callsTo("agents.retryManager").map((call) => call.input)).toEqual([{ project: "CDE" }]),
		);
		await waitFor(() => expect(screen.queryByText(/Manager failed/)).toBeNull());
	});
});
