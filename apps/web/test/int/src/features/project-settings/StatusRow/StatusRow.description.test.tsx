import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../media";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { statusesOf } from "../../../../../rows";
import { createTestServer, type TestServer } from "../../../../../server";
import { StatusSettings } from "../../../../../../src/features/project-settings/StatusSettings";

// The markdown the manager agent reads to decide what to do with a ticket in
// this status. The row editor holds it, and Save status writes it with the
// rest of the row.

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = async (server: TestServer, ref = "CDE") => {
	const project = await server.client.projects.get({ project: ref });
	return renderWithProviders(<StatusSettings project={project} />, {
		path: `/p/${ref}/settings`,
		actor: "dana",
		server,
	});
};

// Opens the editor of one status and gives back its Description field.
const editorOf = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(await screen.findByRole("button", { name: `Edit ${name}` }));
	const form = await screen.findByRole("form", { name: `Edit ${name}` });
	return {
		form,
		field: within(form).getByRole("textbox", { name: `Description for ${name}` }) as HTMLTextAreaElement,
	};
};

const todoOf = async (server: TestServer) =>
	(await server.client.statuses.list({ project: "CDE" })).statuses.find((status) => status.slug === "todo")!;

describe("StatusRow description", () => {
	test("the editor of each status shows the stored description", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const todo = await todoOf(server);
		await server.client.statuses.update({ project: "CDE", status: todo.id, description: "Start a builder." });
		await mount(server);
		expect((await editorOf(user, "Todo")).field.value).toBe("Start a builder.");
		// A project is created with a description on every status, and the
		// edit of one leaves the rest as they are.
		const stored = await statusesOf(server, "CDE");
		for (const name of ["In Progress", "Agent Review", "Human Review", "Done", "Canceled"]) {
			const status = stored.find((entry) => entry.name === name)!;
			expect((await editorOf(user, name)).field.value).toBe(status.description);
		}
	});

	test("Save status writes the description the editor holds", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await mount(server);
		const { form, field } = await editorOf(user, "Todo");
		await user.clear(field);
		await user.type(field, "Start a builder.");
		await user.click(within(form).getByRole("button", { name: "Save status" }));
		await waitFor(() => expect(server.callsTo("statuses.update")).toHaveLength(1));
		expect((await todoOf(server)).description).toBe("Start a builder.");
	});

	// The contract caps a status description at 2000 characters, and the
	// field carries that cap.
	test("the field holds up to 2000 characters", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await mount(server);
		const { field } = await editorOf(user, "Todo");
		expect(field.maxLength).toBe(2000);
	});

	test("a refused save shows the reason", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await mount(server);
		const { form, field } = await editorOf(user, "Todo");
		await user.clear(field);
		await user.type(field, "Start a builder.");
		server.failNext("statuses.update", { code: "PROJECT_ARCHIVED" });
		await user.click(within(form).getByRole("button", { name: "Save status" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"The project is archived. Unarchive it before a change.",
		);
	});
});
