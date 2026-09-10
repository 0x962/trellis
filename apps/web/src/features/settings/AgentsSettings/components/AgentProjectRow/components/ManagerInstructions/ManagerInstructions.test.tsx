import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ProjectSummary, rolePrompt } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { settle } from "../../../../../../../../test/ticketHost";
import { ManagerInstructions } from "./ManagerInstructions";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const rootOf = async (server: FakeServer, key: string): Promise<ProjectSummary> =>
	(await server.client.projects.list({})).find((project) => project.key === key)!;

// The text `trellis instructions --role manager --project CDE` prints. The
// CLI reads the statuses of the project and passes them to rolePrompt.
const printed = async (server: FakeServer, project: string) =>
	rolePrompt({ role: "manager", project, statuses: (await server.client.statuses.list({ project })).statuses });

const mount = async (server: FakeServer) => {
	const project = await rootOf(server, "CDE");
	renderWithProviders(
		<>
			<Toaster />
			<ManagerInstructions project={project} />
		</>,
		{ path: "/settings", actor: "navid", server },
	);
};

const open = async (user: ReturnType<typeof userEvent.setup>) =>
	user.click(await screen.findByRole("button", { name: "Manager instructions" }));

describe("ManagerInstructions", () => {
	test("the dialog shows the prompt the manager starts with", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.statuses.update({
			project: "CDE",
			status: "agent-review",
			description: "The builder opened a PR. Start a reviewer.",
		});
		await mount(server);
		await open(user);
		const text = await printed(server, "CDE");
		await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain(text));
		expect(text).toContain("The builder opened a PR. Start a reviewer.");
	});

	// The prompt file and the status descriptions change while a manager
	// runs, and no row keeps the text trellis sent. The dialog says so.
	test("the dialog says a manager started now receives this text", async () => {
		const user = userEvent.setup();
		await mount(createFakeServer());
		await open(user);
		expect((await screen.findByRole("dialog")).textContent).toContain(
			"A manager started now receives this text. A running manager received the text of its own start.",
		);
	});

	test("the settings page reads the statuses when the dialog opens", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await mount(server);
		await settle();
		expect(server.callsTo("statuses.list")).toHaveLength(0);
		await open(user);
		await waitFor(() => expect(server.callsTo("statuses.list")).toHaveLength(1));
	});

	test("Copy writes the prompt to the clipboard", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await mount(server);
		await open(user);
		await user.click(await screen.findByRole("button", { name: "Copy" }));
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(await printed(server, "CDE")));
		expect(await screen.findByText("Copied the manager instructions")).toBeDefined();
	});
});
