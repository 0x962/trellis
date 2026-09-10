import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import { addSession, updateSession } from "../../../../test/agents";
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
	return renderWithProviders(
		<>
			<Toaster />
			<ManagerStatus project={project} />
		</>,
		{ path: `/p/${ref}`, actor: "navid", server },
	);
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

	// A manager the runner refused to start reads Failed, not Off, so the
	// header never hides a refusal.
	test("a failed manager states the reason, offers Retry, and shows the runner's whole text", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		addSession(server, {
			role: "manager",
			state: "failed",
			failure: { reason: "branch", exitCode: 1, detail: "fatal: invalid reference: main\nthe repo has master" },
		});
		await mount(server);
		const group = within(await status());
		expect(await group.findByText("Failed")).toBeDefined();
		expect((await status()).textContent).toContain("The base branch is not in the Superset project's repository.");
		expect(group.queryByRole("link", { name: "Open in Superset" })).toBeNull();

		await user.click(group.getByRole("button", { name: "Details" }));
		expect((await screen.findByRole("dialog")).textContent).toContain("the repo has master");
		await user.keyboard("{Escape}");

		await user.click(group.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(server.callsTo("agents.retry")).toHaveLength(1));
		await waitFor(async () => expect(within(await status()).getByText("Starting")).toBeDefined());
	});

	// A manager retry answers with its row, not with an error, so the toast
	// has to read that row before it says the agent started.
	test("a manager retry the runner refuses again does not say the agent started", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		addSession(server, {
			role: "manager",
			state: "failed",
			failure: { reason: "error", exitCode: 1, detail: "fatal: invalid reference: main" },
		});
		server.state.runnerDown = "error";
		await mount(server);
		await user.click(within(await status()).getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("Couldn't start the agent")).toBeDefined();
		expect(screen.queryByText("Started the agent")).toBeNull();
	});

	test("follows an agents.session event", async () => {
		const server = createFakeServer();
		const manager = addSession(server, { role: "manager" });
		const { queryClient } = await mount(server);
		expect(await within(await status()).findByText("Running")).toBeDefined();
		createEventApplier(queryClient).applyEvent(updateSession(server, manager.id, { state: "exited" }));
		await waitFor(async () => expect(within(await status()).getByText("Exited")).toBeDefined());
	});
});
