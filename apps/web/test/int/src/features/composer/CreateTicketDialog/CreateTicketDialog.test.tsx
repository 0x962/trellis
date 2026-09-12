import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComposerOptions, composerActions } from "../../../../../../src/features/composer/composerStore";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";
import { calls, findGrid, inputs, listCalls, queryRow, resetUi, rowOf, sleep, toastWith } from "../../../../../table";
import { tableViewport } from "../../../../../viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

// A test can end with the composer open. The composer store outlives this
// file, so an open composer would trap the keys of the next file's app.
afterEach(() => act(resetUi));

const open = async (path: string, options: ComposerOptions = {}, server = createTestServer()) => {
	const app = renderApp({ path, actor: "dana", server });
	await findGrid();
	act(() => composerActions.open(options));
	const dialog = await screen.findByRole("dialog", { name: /new ticket/i });
	const chip = (name: RegExp) => within(dialog).getByRole("button", { name });
	const title = () => within(dialog).getByRole("textbox", { name: /title/i }) as HTMLInputElement;
	return { ...app, dialog, chip, title };
};

const created = (server: ReturnType<typeof createTestServer>) => inputs(server, "tickets.create");

describe("features/composer/CreateTicketDialog", () => {
	// Outcome 89. w-160 is 640 px on the 4 px scale. The seed template
	// starts with "## Goal", so the read-only view shows that heading.
	test("opens as a 640 px modal with the title focused and the template rendered read-only", async () => {
		const { dialog, title } = await open("/p/CDE/table");
		expect(dialog.className).toMatch(/\bw-160\b/);
		// It sits in the middle of the screen, not on an edge.
		expect(dialog.className).toContain("left-1/2");
		expect(dialog.className).not.toContain("right-0");
		await waitFor(() => expect(document.activeElement).toBe(title()));
		expect(within(dialog).getByRole("heading", { name: "Goal" })).toBeDefined();
		expect(dialog.querySelector(".ProseMirror")).toBeNull();
	});

	// Outcome 90
	test("mounts the editor on the first focus of the description", async () => {
		const user = userEvent.setup();
		const { dialog } = await open("/p/CDE/table");
		await user.click(within(dialog).getByRole("button", { name: /description/i }));
		await waitFor(() => expect(dialog.querySelector('.ProseMirror[contenteditable="true"]')).not.toBeNull(), {
			timeout: 5000,
		});
		expect(dialog.querySelector(".ProseMirror")!.textContent).toContain("Goal");
	});

	// Outcome 94
	test("blocks the create on /all until a project is chosen", async () => {
		const user = userEvent.setup();
		const { server, chip, title } = await open("/all/table");
		expect(chip(/^project/i).textContent).toMatch(/choose|pick|select/i);
		expect(chip(/^project/i).textContent).not.toMatch(/CDE|TRL/);
		await user.type(title(), "Needs a home");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await sleep(50);
		expect(calls(server, "tickets.create")).toHaveLength(0);
		await user.click(chip(/^project/i));
		await user.click(await screen.findByRole("option", { name: /TRL/ }));
		await waitFor(() => expect(chip(/^project/i).textContent).toContain("TRL"));
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(calls(server, "tickets.create")).toHaveLength(1));
		expect(created(server)[0]).toMatchObject({ project: "TRL", title: "Needs a home" });
	});

	// A second Cmd+Enter while the create is in flight must not create a
	// second ticket, and Create is disabled until the answer arrives.
	test("creates one ticket for two quick Cmd+Enter presses", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const hold = server.holdNext("tickets.create");
		const { dialog, title } = await open("/p/CDE/table", {}, server);
		await user.type(title(), "Only once");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(calls(server, "tickets.create")).toHaveLength(1));
		const create = within(dialog).getByRole("button", { name: /^Create ⌘↩$|^Create$/ }) as HTMLButtonElement;
		expect(create.disabled).toBe(true);
		hold.release();
		await waitFor(() => expect(screen.queryByRole("dialog", { name: /new ticket/i })).toBeNull());
		await sleep(50);
		expect(calls(server, "tickets.create")).toHaveLength(1);
	});

	// A refused create keeps the draft and the dialog, and the toast offers
	// a Retry that sends the create again.
	test("a refused create shows a toast with Retry and keeps the draft", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		server.failNext("tickets.create", { code: "INPUT_VALIDATION_FAILED" });
		const { title } = await open("/p/CDE/table", {}, server);
		await user.type(title(), "Refused once");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		const toast = await toastWith(/The ticket did not save/);
		expect(screen.getByRole("dialog", { name: /new ticket/i })).toBeDefined();
		expect(title().value).toBe("Refused once");
		await user.click(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(calls(server, "tickets.create")).toHaveLength(2));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: /new ticket/i })).toBeNull());
		expect(created(server)[1]).toMatchObject({ project: "CDE", title: "Refused once" });
	});

	// The server takes a title of 500 characters at most.
	test("the title field takes 500 characters at most", async () => {
		const { title } = await open("/p/CDE/table");
		expect(title().maxLength).toBe(500);
	});

	// Outcome 95. The CDE counter stands at 52, so the next ticket is CDE-53.
	// A status filter does not seed the status (T7): the ticket starts in the
	// project default, Todo. The single priority filter seeds the priority.
	test("creates with the view defaults and closes on Cmd+Enter", async () => {
		const user = userEvent.setup();
		const { server, dialog, title } = await open("/p/CDE/table?status=in-progress&priority=high");
		await user.type(title(), "Ship the table");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(created(server)).toHaveLength(1));
		expect(created(server)[0]).toMatchObject({
			project: "CDE",
			title: "Ship the table",
			status: "todo",
			priority: "high",
		});
		await waitFor(() => expect(dialog.isConnected).toBe(false));
		const toast = await toastWith(/Created CDE-53/);
		expect(within(toast).getByRole("button", { name: "Open" })).toBeDefined();
	});

	// Outcome 96
	test("creates and keeps the dialog open on Cmd+Shift+Enter", async () => {
		const user = userEvent.setup();
		const { server, dialog, chip, title } = await open("/p/CDE/table?priority=high", { status: "in-progress" });
		const chips = () =>
			[chip(/^project/i), chip(/^status/i), chip(/^priority/i), chip(/^parent/i)].map((c) => c.textContent);
		const before = chips();
		await user.type(title(), "First of many");
		await user.keyboard("{Meta>}{Shift>}{Enter}{/Shift}{/Meta}");
		await waitFor(() => expect(created(server)).toHaveLength(1));
		expect(created(server)[0]).toMatchObject({ title: "First of many", status: "in-progress", priority: "high" });
		expect(dialog.isConnected).toBe(true);
		await waitFor(() => expect(title().value).toBe(""));
		expect(chips()).toEqual(before);
	});

	// T7. `c` in a view filtered to Human Review opens with the
	// project default status. The test marks In Progress as the default, so
	// the chip proves that the default flag decides, not the filter.
	test("c in a filtered view opens with the project default status", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { statuses } = await server.client.statuses.list({ project: "CDE" });
		const started = statuses.find((status) => status.slug === "in-progress")!;
		const todo = statuses.find((status) => status.slug === "todo")!;
		await server.client.statuses.update({ project: "CDE", status: todo.id, isDefault: false });
		await server.client.statuses.update({ project: "CDE", status: started.id, isDefault: true });
		renderApp({ path: "/p/CDE/table?status=human-review", actor: "dana", server });
		await findGrid();
		await user.keyboard("c");
		const dialog = await screen.findByRole("dialog", { name: /new ticket/i });
		await waitFor(() =>
			expect(within(dialog).getByRole("button", { name: /^status/i }).textContent).toContain("In Progress"),
		);
	});

	// T7. A new project keeps the chosen status when it has that slug, and
	// takes its own default status when it does not. TRL loses Agent Review
	// here, so the move to TRL falls back to TRL's default, Todo. CDE.web
	// inherits the set of CDE, so the move to it keeps Agent Review.
	test("a project change keeps the status slug when the new project has it", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const trl = (await server.client.statuses.list({ project: "TRL" })).statuses;
		const review = trl.find((status) => status.slug === "agent-review")!;
		const todo = trl.find((status) => status.slug === "todo")!;
		await server.client.statuses.delete({ project: "TRL", status: review.id, moveTo: todo.id });
		const { chip, title } = await open("/p/CDE/table", { status: "agent-review" }, server);
		await waitFor(() => expect(chip(/^status/i).textContent).toContain("Agent Review"));
		await user.click(chip(/^project/i));
		await user.click(await screen.findByRole("option", { name: /^web/ }));
		await waitFor(() => expect(chip(/^project/i).textContent).toContain("web"));
		await waitFor(() => expect(chip(/^status/i).textContent).toContain("Agent Review"));
		await user.click(chip(/^project/i));
		await user.click(await screen.findByRole("option", { name: /^TRL$/ }));
		await waitFor(() => expect(chip(/^status/i).textContent).toContain("Todo"));
		await user.type(title(), "Lands in trellis");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(created(server)).toHaveLength(1));
		expect(created(server)[0]).toMatchObject({ project: "TRL", status: "todo" });
	});

	// Outcome 97. In Progress is the group the composer opened from, so the
	// new row lands there, and the response alone puts it in the cache.
	test("puts the created ticket into the table without a refetch", async () => {
		const user = userEvent.setup();
		const { server, title } = await open("/p/CDE/table?status=in-progress", { status: "in-progress" });
		const before = listCalls(server).length;
		await user.type(title(), "Straight into the group");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(created(server)).toHaveLength(1));
		await waitFor(() => expect(queryRow("CDE-53")).not.toBeNull());
		expect(rowOf("CDE-53").getAttribute("data-group")).toBe("in-progress");
		await sleep(600);
		expect(listCalls(server)).toHaveLength(before);
	});

	// Outcome 100
	test("closes an empty composer without a question", async () => {
		const user = userEvent.setup();
		const { dialog } = await open("/p/CDE/table");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(dialog.isConnected).toBe(false));
		expect(screen.queryByRole("dialog", { name: /discard/i })).toBeNull();
	});

	// Esc asks to discard only when the composer holds text.
	test("asks before it closes a composer with text", async () => {
		const user = userEvent.setup();
		const { dialog, title } = await open("/p/CDE/table");
		await user.type(title(), "Half written");
		await user.keyboard("{Escape}");
		expect(await screen.findByRole("dialog", { name: /discard/i })).toBeDefined();
		expect(dialog.isConnected).toBe(true);
		expect(title().value).toBe("Half written");
	});
});
