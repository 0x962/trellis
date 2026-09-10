import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { StatusSettings } from "../StatusSettings";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = async (server: FakeServer, ref = "CDE", scheduler = createFakeScheduler().scheduler) => {
	const project = await server.client.projects.get({ project: ref });
	return renderWithProviders(<StatusSettings project={project} />, {
		path: `/p/${ref}/settings`,
		actor: "navid",
		server,
		scheduler,
	});
};

const field = async (name: string) =>
	(await screen.findByRole("textbox", { name: `Description for ${name}` })) as HTMLTextAreaElement;

const todoOf = async (server: FakeServer) =>
	(await server.client.statuses.list({ project: "CDE" })).statuses.find((status) => status.slug === "todo")!;

describe("StatusDescriptionField", () => {
	test("shows the stored description under each status", async () => {
		const server = createFakeServer();
		const todo = await todoOf(server);
		await server.client.statuses.update({ project: "CDE", status: todo.id, description: "Start a builder." });
		await mount(server);
		expect((await field("Todo")).value).toBe("Start a builder.");
		for (const name of ["In Progress", "Agent Review", "Human Review", "Done", "Canceled"]) {
			expect((await field(name)).value).toBe("");
		}
	});

	// The same quiet window as the ticket description: a burst of typing
	// saves once, and the write carries the description alone.
	test("saves 800 ms after the last keystroke, once, with the description only", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const todo = await todoOf(server);
		const clock = createFakeScheduler();
		await mount(server, "CDE", clock.scheduler);
		await user.type(await field("Todo"), "Start a builder.");
		act(() => clock.advanceTo(799));
		expect(server.callsTo("statuses.update")).toHaveLength(0);
		act(() => clock.advanceTo(800));
		await waitFor(() => expect(server.callsTo("statuses.update")).toHaveLength(1));
		expect(server.callsTo("statuses.update")[0]!.input).toEqual({
			project: "CDE",
			status: todo.id,
			description: "Start a builder.",
		});
		expect(await screen.findByText("Saved")).toBeDefined();
		expect(server.state.statuses.get(todo.id)!.description).toBe("Start a builder.");
	});

	test("saves at once on blur", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await mount(server);
		await user.type(await field("Agent Review"), "Run a reviewer.");
		await user.tab();
		await waitFor(() => expect(server.callsTo("statuses.update")).toHaveLength(1));
	});

	test("holds up to 2000 characters and shows the count", async () => {
		const user = userEvent.setup();
		await mount(createFakeServer());
		const todo = await field("Todo");
		expect(todo.getAttribute("maxLength")).toBe("2000");
		await user.type(todo, "abc");
		expect(await screen.findByText("3 / 2000")).toBeDefined();
	});

	test("a refused save shows the reason", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		server.failNext("statuses.update", { code: "NOT_FOUND", data: { kind: "status", ref: "todo" } });
		await mount(server);
		await user.type(await field("Todo"), "x");
		await user.tab();
		expect((await screen.findByRole("alert")).textContent).not.toBe("");
	});

	// An inherited set belongs to an ancestor, so it is edited there.
	test("an inherited status set shows no description field", async () => {
		await mount(createFakeServer(), "CDE.web");
		await screen.findByText(/Inherited from/);
		expect(screen.queryAllByRole("textbox", { name: /^Description for/ })).toHaveLength(0);
	});
});
