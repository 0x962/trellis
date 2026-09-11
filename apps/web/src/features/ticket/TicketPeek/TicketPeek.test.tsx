import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { findTicket } from "../../../../test/fake-server/state";
import { press } from "../../../../test/keyboard";
import { mockMatchMedia } from "../../../../test/media";
import { type ProviderOptions, renderWithProviders } from "../../../../test/renderWithProviders";
import { ago, fieldValue, frames, minute, settle } from "../../../../test/ticketHost";
import { usePeek } from "./hooks/usePeek";
import { PeekListProvider } from "./providers/PeekListProvider";
import { peekWidthStorageKey, TicketPeek } from "./TicketPeek";

// The visible list order the table shows. CDE-42 sits at index 3.
const identifiers = ["CDE-45", "CDE-44", "CDE-43", "CDE-42", "CDE-41"];
const rows = identifiers.map((identifier) => ({ identifier, visible: true }));

// A stand-in for the table: one button per row. The table wires its rows
// to `usePeek` the same way, with the row element as the opener.
function Rows() {
	const { open } = usePeek();
	return (
		<ul aria-label="Rows">
			{identifiers.map((identifier) => (
				<li key={identifier}>
					<button type="button" onClick={(event) => open(identifier, event.currentTarget)}>
						{identifier}
					</button>
				</li>
			))}
		</ul>
	);
}

const mount = (path: string, options: Partial<ProviderOptions> = {}) =>
	renderWithProviders(
		<PeekListProvider rows={rows}>
			<Rows />
			<TicketPeek />
			<Toaster />
		</PeekListProvider>,
		{ path, actor: "navid", ...options },
	);

const peek = (identifier = "CDE-42") => screen.findByRole("dialog", { name: identifier });
const row = (identifier: string) =>
	within(screen.getByRole("list", { name: "Rows" })).getByRole("button", { name: identifier });
const title = (panel: HTMLElement) => within(panel).getByRole("textbox", { name: "Title" });

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	window.innerWidth = 1280;
});

describe("features/ticket/TicketPeek", () => {
	// WT-02. The list routes mount the peek and read the param themselves.
	test("renders from the peek search param as a non-modal dialog 720 px wide", async () => {
		mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		expect(panel.getAttribute("aria-modal")).toBe("false");
		expect(panel.style.width).toBe("720px");
		expect(document.querySelector(".bg-scrim")).toBeNull();
		await waitFor(() => expect(fieldValue(title(panel))).toBe("Restore the fork pages after the upstream 1.27 merge"));
	});

	test("a saved width respects the viewport minimum", async () => {
		window.innerWidth = 1920;
		localStorage.setItem(peekWidthStorageKey, "480");
		mount("/p/CDE?peek=CDE-42");
		const panel = await peek();
		expect(panel.classList.contains("min-w-peek")).toBe(true);
		expect(panel.style.width).toBe("480px");
		await within(panel).findByLabelText("Properties");
	});

	test("a drag starts from the visible width when the viewport minimum exceeds the saved width", async () => {
		window.innerWidth = 1920;
		localStorage.setItem(peekWidthStorageKey, "480");
		mount("/p/CDE?peek=CDE-42");
		const panel = await peek();
		panel.getBoundingClientRect = () => new DOMRect(1056, 0, 864, 900);
		const handle = within(panel).getByLabelText(/resize/i);
		fireEvent.pointerDown(handle, { clientX: 1056, pointerId: 1, button: 0 });
		fireEvent.pointerMove(handle, { clientX: 976, pointerId: 1 });
		fireEvent.pointerUp(handle, { clientX: 976, pointerId: 1 });
		expect(panel.style.width).toBe("944px");
		expect(localStorage.getItem(peekWidthStorageKey)).toBe("944");
		await within(panel).findByLabelText("Properties");
	});

	test("the resize arrow starts from the visible width when the viewport minimum exceeds the saved width", async () => {
		window.innerWidth = 1920;
		localStorage.setItem(peekWidthStorageKey, "480");
		mount("/p/CDE?peek=CDE-42");
		const panel = await peek();
		panel.getBoundingClientRect = () => new DOMRect(1056, 0, 864, 900);
		fireEvent.keyDown(within(panel).getByLabelText(/resize/i), { key: "ArrowLeft" });
		expect(panel.style.width).toBe("880px");
		expect(localStorage.getItem(peekWidthStorageKey)).toBe("880");
		await within(panel).findByLabelText("Properties");
	});

	// WT-03. The title is the first thing a person edits in a peek.
	test("moves focus to the title on open", async () => {
		const user = userEvent.setup();
		mount("/p/CDE/table");
		const opener = row("CDE-42");
		opener.focus();
		await user.click(opener);
		const panel = await peek();
		await frames();
		await waitFor(() => expect(document.activeElement).toBe(title(panel)));
	});

	// WT-04. The peek is a search param, so closing it drops the param.
	test("Escape closes the peek and returns focus to the originating row", async () => {
		const user = userEvent.setup();
		const { router } = mount("/p/CDE/table");
		const opener = row("CDE-42");
		opener.focus();
		await user.click(opener);
		await waitFor(() => expect(router.state.location.search).toMatchObject({ peek: "CDE-42" }));
		await peek();
		await frames();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
		await waitFor(() => expect(document.activeElement).toBe(opener));
	});

	// WT-05. Escape closes the innermost layer first.
	test("Escape closes an open popover before it closes the peek", async () => {
		const user = userEvent.setup();
		mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		const rail = await within(panel).findByLabelText("Properties");
		await user.click(within(rail).getByRole("button", { name: /Human Review/ }));
		await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
		expect(screen.getByRole("dialog", { name: "CDE-42" })).toBeDefined();
	});

	// WT-06. j and k walk the list order; the param follows each step.
	test("j and k walk the list while the peek stays open", async () => {
		const { router } = mount("/p/CDE/table?peek=CDE-42");
		await peek();
		press("j");
		await waitFor(() => expect(router.state.location.search).toMatchObject({ peek: "CDE-41" }));
		expect(await peek("CDE-41")).toBeDefined();
		press("k");
		await waitFor(() => expect(router.state.location.search).toMatchObject({ peek: "CDE-42" }));
		expect(await peek("CDE-42")).toBeDefined();
	});

	// WT-09
	test("o opens the full page and closes the peek", async () => {
		const { router } = mount("/p/CDE/table?peek=CDE-42");
		await peek();
		press("o");
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-42"));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
	});

	// WT-10. The handle sits on the page-facing edge; a drag to the left
	// widens. The width survives a remount, which is what a reload is.
	test("the drag handle resizes the peek and the width persists", async () => {
		const first = mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		const handle = within(panel).getByLabelText(/resize/i);
		fireEvent.pointerDown(handle, { clientX: 700, pointerId: 1, button: 0 });
		fireEvent.pointerMove(handle, { clientX: 620, pointerId: 1 });
		fireEvent.pointerUp(handle, { clientX: 620, pointerId: 1 });
		await waitFor(() => expect(panel.style.width).toBe("800px"));
		expect(localStorage.getItem(peekWidthStorageKey)).toContain("800");
		first.unmount();
		mount("/p/CDE/table?peek=CDE-42");
		expect((await peek()).style.width).toBe("800px");
	});

	// WT-11. Under 1100 px the peek fills the width; it stays a peek.
	test("below 1100 px the peek fills the width and still closes on Escape", async () => {
		const user = userEvent.setup();
		window.innerWidth = 1000;
		mockMatchMedia(true);
		const { router } = mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		expect(["100%", "100vw", "1000px"]).toContain(panel.style.width);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(router.state.location.search).not.toHaveProperty("peek");
	});

	// WT-12. The peek is narrower than the page, so the rail folds into a
	// two-column grid under the title. w-70 is the 280 px rail of the page.
	test("renders the property grid instead of the rail", async () => {
		mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		const grid = await within(panel).findByLabelText("Properties");
		expect(grid.tagName).not.toBe("ASIDE");
		expect(grid.className).toMatch(/\bgrid-cols-2\b/);
		expect(panel.querySelector(".w-70")).toBeNull();
		const field = title(panel);
		expect(field.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
	});

	// WT-13
	test("the peek header carries Expand and Close", async () => {
		const user = userEvent.setup();
		const { router } = mount("/p/CDE/table?peek=CDE-42");
		const panel = await peek();
		const header = within(panel).getByLabelText("Ticket header");
		expect(within(header).getByRole("button", { name: /^Close/ })).toBeDefined();
		await user.click(within(header).getByRole("button", { name: /^Expand/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/t/CDE-42"));
	});

	// WT-109. CDE-43 has four pending checks; its last actor is set live.
	// happy-dom has no CSS engine, so the classes are the evidence.
	test("reduced motion drops the slide, the shimmer, and the pulse", async () => {
		mockMatchMedia(true);
		const { server } = mount("/p/CDE/table");
		const ticket = findTicket(server.state, "CDE-43")!;
		ticket.lastActor = { name: "claude-code", kind: "agent", at: ago(2 * minute) };
		const user = userEvent.setup();
		await user.click(row("CDE-43"));
		const panel = await peek("CDE-43");
		expect(panel.className).toMatch(/motion-reduce:transition-opacity/);
		expect(panel.className).toMatch(/motion-reduce:data-starting-style:translate-x-0/);
		await waitFor(() => expect(panel.querySelectorAll('[data-bucket="pending"]').length).toBe(4));
		for (const segment of panel.querySelectorAll('[data-bucket="pending"]')) {
			expect(segment.className).toMatch(/motion-reduce:animate-none/);
		}
		const dot = await waitFor(() => {
			const found = panel.querySelector<HTMLElement>("[data-live]");
			expect(found).not.toBeNull();
			return found!;
		});
		expect(dot.className).toMatch(/motion-reduce:animate-none/);
		await settle();
	});
});
