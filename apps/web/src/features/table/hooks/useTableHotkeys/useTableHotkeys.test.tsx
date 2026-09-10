import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { findTicket } from "../../../../../test/fake-server/state";
import { renderApp } from "../../../../../test/renderWithProviders";
import {
	filterBar,
	findGrid,
	focusRow,
	grid,
	groupHeaders,
	press,
	queryBulkBar,
	resetUi,
	rowOf,
	rows,
} from "../../../../../test/table";
import { tableViewport } from "../../../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

// In Progress: CDE-44, CDE-43, CDE-41, CDE-38. Human Review: CDE-42, CDE-37.
const started = "/p/CDE?status=in-progress";
const review = "/p/CDE?status=human-review";

const ready = async (path: string, first: string, server: FakeServer = createFakeServer()) => {
	const app = renderApp({ path, actor: "navid", server });
	await findGrid();
	await waitFor(() => rowOf(first));
	return app;
};

const peekOf = (router: { state: { location: { search: unknown } } }) =>
	(router.state.location.search as { peek?: string }).peek;

const focused = () => rows().filter((row) => row.hasAttribute("data-focused"));

describe("features/table/hooks/useTableHotkeys", () => {
	// Outcome 35. The focused row is the one tab stop and carries the focus bar.
	test("moves the focused row with j, k, and the arrow keys", async () => {
		await ready(started, "CDE-44");
		focusRow("CDE-44");
		press("j");
		expect(document.activeElement).toBe(rows()[1]!);
		press("ArrowDown");
		expect(document.activeElement).toBe(rows()[2]!);
		press("k");
		expect(document.activeElement).toBe(rows()[1]!);
		expect(rows().map((row) => row.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
		expect(focused()).toEqual([rows()[1]!]);
	});

	// Outcome 36. The peek is a search param, so the grid element survives it.
	test("opens the peek for the focused row on Enter and Space", async () => {
		const { router } = await ready(review, "CDE-42");
		const table = grid();
		focusRow("CDE-42");
		press("Enter");
		await waitFor(() => expect(peekOf(router)).toBe("CDE-42"));
		await router.navigate({ to: "/p/$", params: { _splat: "CDE" }, search: { status: ["human-review"] } });
		await waitFor(() => expect(peekOf(router)).toBeUndefined());
		focusRow("CDE-42");
		press(" ");
		await waitFor(() => expect(peekOf(router)).toBe("CDE-42"));
		expect(grid()).toBe(table);
	});

	// Outcome 37
	test("opens the full page on o", async () => {
		const { router } = await ready(review, "CDE-42");
		focusRow("CDE-42");
		press("o");
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-42"));
	});

	// Outcome 42
	test("unwinds the popover, the selection, and the focus on Esc in that order", async () => {
		await ready(started, "CDE-44");
		focusRow("CDE-44");
		press("x");
		expect(queryBulkBar()).not.toBeNull();
		press("s");
		const popover = await screen.findByRole("dialog");
		press("Escape");
		await waitFor(() => expect(popover.isConnected).toBe(false));
		expect(queryBulkBar()).not.toBeNull();
		expect(rowOf("CDE-44").getAttribute("aria-selected")).toBe("true");
		await waitFor(() => expect(document.activeElement).toBe(rowOf("CDE-44")));
		press("Escape");
		expect(queryBulkBar()).toBeNull();
		expect(rowOf("CDE-44").getAttribute("aria-selected")).toBe("false");
		expect(document.activeElement).toBe(rowOf("CDE-44"));
		press("Escape");
		expect(document.activeElement).toBe(document.body);
	});

	// Outcome 46
	test("opens the composer on c", async () => {
		await ready(review, "CDE-42");
		focusRow("CDE-42");
		press("c");
		expect(await screen.findByRole("dialog", { name: /new ticket/i })).toBeDefined();
	});

	// Outcome 47. The branch name is the identifier and the title slug.
	test("copies the ID, the branch name, and the link from the focused row", async () => {
		userEvent.setup();
		const server = createFakeServer();
		findTicket(server.state, "CDE-42")!.title = "OAuth refresh";
		await ready(review, "CDE-42", server);
		focusRow("CDE-42");
		press("c", { metaKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("CDE-42"));
		press("C", { metaKey: true, shiftKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("cde-42-oauth-refresh"));
		press(".", { metaKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("http://trellis.local/t/CDE-42"));
	});

	// Outcome 49
	test("focuses the filter bar on the g s sequence", async () => {
		await ready(review, "CDE-42");
		focusRow("CDE-42");
		press("g");
		press("s");
		expect(document.activeElement).toBe(within(filterBar()).getByRole("button", { name: "Filter" }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// Outcome 50
	test("toggles the nth group with the digit keys", async () => {
		await ready("/p/CDE?status=todo,in-progress,agent-review,human-review", "CDE-44");
		await waitFor(() => expect(groupHeaders()).toHaveLength(4));
		focusRow("CDE-44");
		press("2");
		press("4");
		expect(groupHeaders().map((header) => header.getAttribute("aria-expanded"))).toEqual([
			"true",
			"false",
			"true",
			"false",
		]);
		press("2");
		expect(groupHeaders()[1]!.getAttribute("aria-expanded")).toBe("true");
	});

	// Outcome 51. A text field inside the filter bar takes the letters.
	test("ignores the row shortcuts while a text field has focus", async () => {
		const user = userEvent.setup();
		await ready(started, "CDE-44");
		focusRow("CDE-44");
		const input = document.createElement("input");
		filterBar().appendChild(input);
		input.focus();
		await user.keyboard("jxc");
		expect(input.value).toBe("jxc");
		expect(document.activeElement).toBe(input);
		expect(rowOf("CDE-44").getAttribute("tabindex")).toBe("0");
		expect(rowOf("CDE-44").getAttribute("aria-selected")).toBe("false");
		expect(queryBulkBar()).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		input.remove();
	});
});
