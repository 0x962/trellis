import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import { createEventApplier } from "@trellis/api";
import { addPing, addSession, updateSession } from "../../../../test/agents";
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

	// The heartbeat pings the manager while nothing changes, so the last ping
	// says the manager is reachable even when the last batch is old.
	test("shows the last ping beside the last batch", async () => {
		const server = createFakeServer();
		addSession(server, { role: "manager", lastWokenAt: ago(30 * minute) });
		addPing(server, { at: ago(2 * minute) });
		await mount(server);
		const group = within(await status());
		expect(await group.findByText("Last batch 30m ago")).toBeDefined();
		expect(group.getByText("Last ping 2m ago")).toBeDefined();
	});

	test("a ping that restarted the manager says so, and no ping at all says so", async () => {
		const restarted = createFakeServer();
		addSession(restarted, { role: "manager" });
		addPing(restarted, { at: ago(minute), restarted: true });
		const view = await mount(restarted);
		expect(await within(await status()).findByText("Last ping 1m ago, restarted")).toBeDefined();
		view.unmount();

		const quiet = createFakeServer();
		addSession(quiet, { role: "manager" });
		await mount(quiet);
		expect(await within(await status()).findByText("No ping yet")).toBeDefined();
	});
});
