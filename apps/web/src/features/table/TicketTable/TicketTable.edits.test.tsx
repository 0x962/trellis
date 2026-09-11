import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { interceptFetch } from "../../../../test/interceptFetch";
import { renderApp } from "../../../../test/renderWithProviders";
import { patchTicket, ticketRow } from "../../../../test/rows";
import { createTestServer, type TestServer } from "../../../../test/server";
import {
	calls,
	cellOf,
	findGrid,
	focusRow,
	inputs,
	listCalls,
	press,
	queryGroupHeader,
	resetUi,
	rowOf,
	rows,
	sleep,
	toastWith,
} from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const pickFromCell = async (
	user: ReturnType<typeof userEvent.setup>,
	identifier: string,
	column: string,
	name: RegExp | string,
) => {
	await user.click(within(cellOf(identifier, column)).getByRole("button"));
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByRole("option", { name }));
};

// Opens a row's picker from its key. The status grouping hides the status
// column and the project grouping hides the project column, so the key is
// how those pickers open there.
const pickWithKey = async (
	user: ReturnType<typeof userEvent.setup>,
	identifier: string,
	key: string,
	name: RegExp | string,
) => {
	focusRow(identifier);
	press(key);
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByRole("option", { name }));
};

const cachedRows = (queryClient: {
	getQueryCache: () => { getAll: () => { queryKey: unknown; state: { data: unknown } }[] };
}) =>
	queryClient
		.getQueryCache()
		.getAll()
		.filter((query) => JSON.stringify((query.queryKey as unknown[])[0]) === JSON.stringify(["tickets", "list"]))
		.flatMap((query) => {
			const data = query.state.data as { pages?: { items: unknown[] }[]; items?: unknown[] } | undefined;
			return data?.pages?.flatMap((page) => page.items) ?? data?.items ?? [];
		}) as { identifier: string; version: number; priority: string }[];

const held = (server: TestServer = createTestServer()) =>
	interceptFetch(server, { match: (text) => text.includes("tickets/update") });

describe("features/table/TicketTable: inline edits", () => {
	// Outcome 52. CDE.web holds 7 Todo rows and 3 In Progress rows.
	test("applies an inline status change optimistically", async () => {
		const user = userEvent.setup();
		const slow = held();
		const { server } = renderApp({
			path: "/p/CDE/web/table?status=todo,in-progress",
			actor: "dana",
			server: slow.server,
		});
		await findGrid();
		await waitFor(() => rowOf("CDE-51"));
		expect(rowOf("CDE-51").getAttribute("data-group")).toBe("todo");
		await pickWithKey(user, "CDE-51", "s", "In Progress");
		expect(rowOf("CDE-51").getAttribute("data-group")).toBe("in-progress");
		expect(slow.held()).toBe(1);
		slow.release();
		await waitFor(() => expect(calls(server, "tickets.update")).toHaveLength(1));
		expect(inputs(server, "tickets.update")[0]).toMatchObject({ ticket: "CDE-51" });
	});

	// Outcome 53. The server row moved ahead of the cached version, so the
	// conditional write fails with 412.
	test("rolls the row back and names the ticket in the toast on a 412", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		renderApp({ path: "/p/CDE/table?status=human-review", actor: "dana", server });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		await patchTicket(server, "CDE-42", { version: (await ticketRow(server, "CDE-42")).version + 7 });
		await pickWithKey(user, "CDE-42", "s", "In Progress");
		const toast = await toastWith(/CDE-42/);
		expect(within(toast).getByRole("button", { name: "Retry" })).toBeDefined();
		await waitFor(() => expect(rowOf("CDE-42").getAttribute("data-group")).toBe("human-review"));
		expect(calls(server, "tickets.update")).toHaveLength(1);
	});

	// Outcome 54
	test("writes the mutation response into the cache without a refetch", async () => {
		const user = userEvent.setup();
		const { server, queryClient } = renderApp({ path: "/p/CDE/table?status=in-progress", actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		const before = listCalls(server).length;
		const version = cachedRows(queryClient).find((row) => row.identifier === "CDE-44")!.version;
		await pickFromCell(user, "CDE-44", "priority", /low/i);
		await waitFor(() => expect(calls(server, "tickets.update")).toHaveLength(1));
		await sleep(600);
		const cached = cachedRows(queryClient).find((row) => row.identifier === "CDE-44")!;
		expect(cached.priority).toBe("low");
		expect(cached.version).toBe(version + 1);
		expect(listCalls(server)).toHaveLength(before);
	});

	// Outcome 55. CDE-8 is the one Todo row of CDE.web with no priority.
	test("applies an inline priority change optimistically and re-sorts the group", async () => {
		const user = userEvent.setup();
		const slow = held();
		renderApp({ path: "/p/CDE/web/table?status=todo", actor: "dana", server: slow.server });
		await findGrid();
		await waitFor(() => rowOf("CDE-8"));
		expect(within(cellOf("CDE-8", "priority")).getByRole("img", { name: "Priority: none" })).toBeDefined();
		expect(rows()[0]!.getAttribute("data-identifier")).not.toBe("CDE-8");
		await pickFromCell(user, "CDE-8", "priority", /urgent/i);
		expect(within(cellOf("CDE-8", "priority")).getByRole("img", { name: "Priority: urgent" })).toBeDefined();
		expect(rows()[0]!.getAttribute("data-identifier")).toBe("CDE-8");
		expect(slow.held()).toBe(1);
		slow.release();
	});

	// Outcome 56. Grouped by project: CDE-43 under CDE, the rest under CDE.web.
	test("moves the row between project groups optimistically", async () => {
		const user = userEvent.setup();
		const slow = held();
		renderApp({ path: "/p/CDE/table?status=in-progress&group=project", actor: "dana", server: slow.server });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		expect(rowOf("CDE-44").getAttribute("data-group")).toBe("CDE.web");
		expect(queryGroupHeader("CDE.host")).toBeNull();
		await pickWithKey(user, "CDE-44", "m", /host/);
		expect(rowOf("CDE-44").getAttribute("data-group")).toBe("CDE.host");
		expect(queryGroupHeader("CDE.host")).not.toBeNull();
		expect(slow.held()).toBe(1);
		slow.release();
	});

	// Outcome 57
	test("never edits the title inline in the table", async () => {
		const { router } = renderApp({ path: "/p/CDE/table?status=in-progress", actor: "dana" });
		await findGrid();
		await waitFor(() => rowOf("CDE-44"));
		fireEvent.doubleClick(cellOf("CDE-44", "title"));
		await waitFor(() => expect((router.state.location.search as { peek?: string }).peek).toBe("CDE-44"));
		expect(within(rowOf("CDE-44")).queryByRole("textbox")).toBeNull();
		expect(rowOf("CDE-44").querySelector("[contenteditable]")).toBeNull();
	});
});
