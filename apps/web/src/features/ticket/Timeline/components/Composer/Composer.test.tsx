import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { press } from "../../../../../../test/keyboard";
import { renderTicket, settle } from "../../../../../../test/ticketHost";
import { Timeline } from "../../Timeline";

beforeEach(() => localStorage.clear());

// The composer is pinned inside the Timeline, so the card it posts is on
// the same screen.
const mount = (server: FakeServer = createFakeServer()) =>
	renderTicket("CDE-42", (ticket) => <Timeline ticket={ticket} pinned />, { path: "/t/CDE-42", server });

const composer = () => screen.findByRole("textbox", { name: "Comment" });
const list = () => screen.findByRole("list", { name: "Timeline" });
const text = (element: HTMLElement) =>
	element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? "");

describe("features/ticket/Timeline/components/Composer", () => {
	// TK-7. At rest the composer is one line with the deck placeholder and no
	// button. Comment shows once the field holds text.
	test("Comment shows only when the field holds text", async () => {
		const user = userEvent.setup();
		mount();
		const box = await composer();
		expect(box.getAttribute("placeholder")).toBe("Write a comment…");
		expect(screen.queryByRole("button", { name: "Comment" })).toBeNull();
		await user.click(box);
		await user.keyboard("Looks right.");
		expect(screen.getByRole("button", { name: "Comment" })).toBeDefined();
		await user.clear(box);
		expect(screen.queryByRole("button", { name: "Comment" })).toBeNull();
	});

	test("the pinned composer has an opaque background and a taller resting field", async () => {
		mount();
		const box = await composer();
		const wrapper = box.closest("fieldset")!.parentElement!;
		expect(wrapper.className).toMatch(/\bbg-surface\b/);
		expect(box.closest("fieldset")!.className).toMatch(/\bbg-elevated\b/);
		expect(box.closest("fieldset")!.className).toMatch(/\bmin-h-20\b/);
	});

	// WT-83
	test("Cmd+Enter posts the comment optimistically", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("comments.create");
		mount(server);
		const box = await composer();
		await user.click(box);
		await user.keyboard("Tests still not run.");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(server.callsTo("comments.create")).toHaveLength(1));
		expect((server.callsTo("comments.create")[0]!.input as { body: string }).body).toBe("Tests still not run.");
		expect(within(await list()).getByText("Tests still not run.")).toBeDefined();
		expect(text(await composer()).trim()).toBe("");
		hold.release();
		await settle();
		expect(server.callsTo("comments.create")).toHaveLength(1);
		expect(within(await list()).getAllByText("Tests still not run.")).toHaveLength(1);
	});

	// WT-84
	test("Shift+C focuses the composer", async () => {
		mount();
		const box = await composer();
		const scroll = spyOn(HTMLElement.prototype, "scrollIntoView");
		document.body.focus();
		press("C", { shiftKey: true });
		await waitFor(() => expect(box.contains(document.activeElement) || document.activeElement === box).toBe(true));
		expect(scroll).toHaveBeenCalled();
		scroll.mockRestore();
	});

	// WT-85. Rollback returns the words to the composer, so nothing is lost.
	test("a failed comment rolls back and keeps the text", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("comments.create");
		server.failNext("comments.create", { code: "PROJECT_ARCHIVED" });
		mount(server);
		const box = await composer();
		await user.click(box);
		await user.keyboard("Tests still not run.");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(server.callsTo("comments.create")).toHaveLength(1));
		expect(within(await list()).getByText("Tests still not run.")).toBeDefined();
		hold.release();
		await waitFor(() =>
			expect(within(screen.getByRole("list", { name: "Timeline" })).queryByText("Tests still not run.")).toBeNull(),
		);
		expect(text(await composer())).toContain("Tests still not run.");
		const toast = await screen.findByText("The project is archived. Unarchive it before a change.");
		expect(within(toast.closest("li")!).getByRole("button", { name: "Retry" })).toBeDefined();
	});
});
