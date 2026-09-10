import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { createEventApplier } from "@trellis/api";
import userEvent from "@testing-library/user-event";
import { addSession, enableAgents, failedSession, startReason, updateSession } from "../../../../test/agents";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ago, minute } from "../../../../test/ticketHost";
import { ManagerStatus } from "./ManagerStatus";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = async (server: FakeServer, ref = "CDE") => {
	const project = await server.client.projects.get({ project: ref });
	return renderWithProviders(<ManagerStatus project={project} />, { path: `/p/${ref}`, actor: "navid", server });
};

const status = () => screen.findByRole("group", { name: "Manager" });

describe("ManagerStatus", () => {
	test("shows Off when the project has no manager", async () => {
		await mount(createFakeServer());
		const group = within(await status());
		expect(await group.findByText("Off")).toBeDefined();
		expect(group.queryByRole("link")).toBeNull();
	});

	test("shows a running manager, its last batch time, and Open in Superset", async () => {
		const server = createFakeServer();
		addSession(server, { role: "manager", lastWokenAt: ago(3 * minute), openUrl: "superset://workspace/ws-m" });
		await mount(server);
		const group = within(await status());
		expect(await group.findByText("Running")).toBeDefined();
		expect(group.getByText("Last batch 3m ago")).toBeDefined();
		expect(group.getByRole("link", { name: "Open in Superset" }).getAttribute("href")).toBe(
			"superset://workspace/ws-m",
		);
	});

	test("names the starting, waiting, and exited states", async () => {
		for (const [state, label] of [
			["starting", "Starting"],
			["waiting", "Waiting"],
			["exited", "Exited"],
		] as const) {
			const server = createFakeServer();
			addSession(server, { role: "manager", state });
			const view = await mount(server);
			expect(await within(await status()).findByText(label)).toBeDefined();
			view.unmount();
		}
	});

	test("a stopped manager reads Off, and a manager with no batch says so", async () => {
		const stopped = createFakeServer();
		addSession(stopped, { role: "manager", state: "stopped" });
		const view = await mount(stopped);
		expect(await within(await status()).findByText("Off")).toBeDefined();
		view.unmount();

		const fresh = createFakeServer();
		addSession(fresh, { role: "manager" });
		await mount(fresh);
		expect(await within(await status()).findByText("No batch yet")).toBeDefined();
	});

	// One manager serves the whole tree, so a sub-project shows its root's.
	test("a sub-project shows the manager of its root", async () => {
		const server = createFakeServer();
		addSession(server, { role: "manager" });
		await mount(server, "CDE.web");
		expect(await within(await status()).findByText("Running")).toBeDefined();
	});

	test("follows an agents.session event", async () => {
		const server = createFakeServer();
		const manager = addSession(server, { role: "manager" });
		const { queryClient } = await mount(server);
		expect(await within(await status()).findByText("Running")).toBeDefined();
		createEventApplier(queryClient).applyEvent(updateSession(server, manager.id, { state: "exited" }));
		await waitFor(async () => expect(within(await status()).getByText("Exited")).toBeDefined());
	});

	test("a failed manager reads Manager failed with the short reason and links the full error", async () => {
		const server = createFakeServer();
		const failed = failedSession(server, "manager");
		await mount(server);
		const group = within(await status());
		expect(await group.findByText(`Manager failed: ${startReason}`)).toBeDefined();
		expect(group.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/agents#${failed.id}`);
		expect(group.queryByText("Off")).toBeNull();
	});

	test("Retry starts the failed manager again, and the header follows it", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await enableAgents(server);
		failedSession(server, "manager");
		await mount(server);
		const group = within(await status());
		await user.click(await group.findByRole("button", { name: "Retry" }));
		await waitFor(() =>
			expect(server.callsTo("agents.retryManager").map((call) => call.input)).toEqual([{ project: "CDE" }]),
		);
		expect(await group.findByText("Starting")).toBeDefined();
		expect(group.queryByText(/Manager failed/)).toBeNull();
	});
});
