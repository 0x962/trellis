import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { findTicket } from "../../../../test/fake-server/state";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { press } from "../../../../test/keyboard";
import { mockMatchMedia } from "../../../../test/media";
import { ago, hour, minute, renderTicket, settle, statusOf } from "../../../../test/ticketHost";
import { TicketView } from "../TicketView";
import { PropertiesRail } from "./PropertiesRail";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const rowOrder = ["Status", "Priority", "Project", "Parent", "Sub-tickets", "Branch", "Created", "Updated"];

const mount = (identifier = "CDE-42", server: FakeServer = createFakeServer(), path = "/p/CDE/table") =>
	renderTicket(identifier, (ticket) => <PropertiesRail ticket={ticket} variant="page" />, { path, server });

const rail = () => screen.findByLabelText("Properties");

// The value cell of one row: the `dd` after the `dt` that carries `label`.
const rowNow = (label: string) => {
	const term = within(screen.getByLabelText("Properties"))
		.getAllByRole("term")
		.find((element) => element.textContent === label)!;
	return term.nextElementSibling as HTMLElement;
};

const row = async (label: string) => {
	await rail();
	return rowNow(label);
};

const popover = () => screen.findByRole("dialog");
const updates = (server: FakeServer) => server.callsTo("tickets.update");
const cachedStatus = (view: ReturnType<typeof mount>) =>
	view.queryClient.getQueryData<Ticket>(view.orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } }))!.status.name;

// An agent last touched CDE-42 `agoMs` before now.
const touchedByAgent = (server: FakeServer, agoMs: number) => {
	const ticket = findTicket(server.state, "CDE-42")!;
	ticket.updatedAt = ago(agoMs);
	ticket.lastActor = { name: "claude-code", kind: "agent", at: ticket.updatedAt };
};

describe("features/ticket/PropertiesRail", () => {
	// WT-40. The rail is where a save reports itself: Saved beside the version.
	test("shows the Saved state after a description save", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const before = await server.client.tickets.get({ ticket: "CDE-42" });
		const clock = createFakeScheduler();
		const view = renderTicket("CDE-42", (ticket) => <TicketView identifier={ticket.identifier} variant="page" />, {
			path: "/t/CDE-42",
			server,
			scheduler: clock.scheduler,
		});
		await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
		press("e");
		const element = await screen.findByRole("textbox", { name: "Description" });
		await user.click(element);
		await user.keyboard(" Saved text.");
		act(() => clock.advanceTo(1000));
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		const element_ = await rail();
		const saved = await within(element_).findByText("Saved");
		expect(saved.closest("dd")).toBe(rowNow("Updated"));
		const key = view.orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		await waitFor(() => expect(view.queryClient.getQueryData<Ticket>(key)!.version).toBe(before.version + 1));
	});

	// T3.8. The rail has three groups and no Version row.
	test("the rail draws three groups and no Version row", async () => {
		mount();
		const element = await rail();
		expect(element.className).toMatch(/\bh-full\b/);
		expect(within(element).queryByText("Version")).toBeNull();
		expect(element.querySelectorAll("[data-rail-divider]")).toHaveLength(2);
	});

	// T3.8. With no sub-tickets, the row offers a new one and draws no ring.
	test("a ticket with no sub-tickets shows New sub-ticket", async () => {
		mount("CDE-47");
		const value = await row("Sub-tickets");
		await waitFor(() => expect(within(value).getByRole("button", { name: "New sub-ticket" })).toBeDefined());
		expect(value.querySelector("svg circle")).toBeNull();
	});

	// WT-47
	test("lists the property rows in the specified order", async () => {
		mount();
		const terms = within(await rail())
			.getAllByRole("term")
			.map((term) => term.textContent);
		expect(terms.slice(0, rowOrder.length)).toEqual(rowOrder);
	});

	// WT-48
	test("the status picker paints the new status optimistically", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("tickets.update");
		const view = mount("CDE-42", server);
		await user.click(within(await row("Status")).getByRole("button", { name: /Human Review/ }));
		await user.click(within(await popover()).getByRole("option", { name: "In Progress" }));
		await waitFor(() => expect(within(screen.getByLabelText("Properties")).getByText("In Progress")).toBeDefined());
		expect(cachedStatus(view)).toBe("In Progress");
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect(statusOf(server.state.statuses.values(), updates(server)[0]!.input)!.name).toBe("In Progress");
		hold.release();
	});

	// WT-49. Rollback restores the snapshot; the toast carries the server's
	// message and a Retry.
	test("a failed status change rolls back and toasts with Retry", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("tickets.update");
		server.failNext("tickets.update", { code: "PROJECT_ARCHIVED" });
		const view = mount("CDE-42", server);
		await user.click(within(await row("Status")).getByRole("button", { name: /Human Review/ }));
		await user.click(within(await popover()).getByRole("option", { name: "In Progress" }));
		await waitFor(() => expect(cachedStatus(view)).toBe("In Progress"));
		hold.release();
		await waitFor(() => expect(within(screen.getByLabelText("Properties")).getByText("Human Review")).toBeDefined());
		expect(cachedStatus(view)).toBe("Human Review");
		const toast = await screen.findByText("The project is archived. Unarchive it before a change.");
		expect(within(toast.closest("li")!).getByRole("button", { name: "Retry" })).toBeDefined();
	});

	// WT-50
	test("the priority picker paints the new priority optimistically", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const hold = server.holdNext("tickets.update");
		mount("CDE-42", server);
		await user.click(within(await row("Priority")).getByRole("button", { name: /High/ }));
		await user.click(within(await popover()).getByRole("option", { name: "Urgent" }));
		await waitFor(() => expect(within(screen.getByLabelText("Properties")).getByText("Urgent")).toBeDefined());
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect((updates(server)[0]!.input as { priority: string }).priority).toBe("urgent");
		hold.release();
	});

	// WT-51. The single-letter keys open the pickers from anywhere on the surface.
	test("s, p, Shift+P, and m open their pickers", async () => {
		const user = userEvent.setup();
		mount();
		await rail();
		const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		press("s");
		expect(within(await popover()).getByRole("option", { name: "In Progress" })).toBeDefined();
		await user.keyboard("{Escape}");
		await closed();
		press("p");
		expect(within(await popover()).getByRole("option", { name: "Urgent" })).toBeDefined();
		await user.keyboard("{Escape}");
		await closed();
		press("P", { shiftKey: true });
		expect(within(await popover()).getByRole("option", { name: "None" })).toBeDefined();
		await user.keyboard("{Escape}");
		await closed();
		press("m");
		expect(within(await popover()).getByRole("option", { name: /^web$|CDE\/web/ })).toBeDefined();
	});

	// WT-52. Numbering is per root, so the server refuses the move. The
	// reason lands in the picker, not in the toaster.
	test("a cross-root move shows the reason inside the picker", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		mount("CDE-42", server);
		await user.click(within(await row("Project")).getByRole("button"));
		const popup = await popover();
		await user.click(within(popup).getByRole("option", { name: /trellis|TRL/ }));
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect((updates(server)[0]!.input as { project: string }).project).toBe("TRL");
		const reason = "A ticket, a parent, or a project cannot move to another root.";
		expect(await within(screen.getByRole("dialog")).findByText(reason)).toBeDefined();
		expect(within(screen.getByRole("status")).queryByText(reason)).toBeNull();
	});

	// WT-53
	test("None clears the parent", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		mount("CDE-42", server);
		await user.click(within(await row("Parent")).getByRole("button", { name: /CDE-43/ }));
		await user.click(within(await popover()).getByRole("option", { name: "None" }));
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect((updates(server)[0]!.input as { parent: unknown }).parent).toBeNull();
		await waitFor(() => expect(rowNow("Parent").textContent).not.toContain("CDE-43"));
		expect(within(rowNow("Parent")).getByText("None")).toBeDefined();
	});

	// WT-54. The branch is derived from the identifier and the title slug.
	test("the branch row shows the derived name and copies it", async () => {
		const user = userEvent.setup();
		mount();
		const branch = await row("Branch");
		expect(branch.textContent).toContain("cde-42-restore-fork-pages");
		await user.click(within(branch).getByRole("button", { name: /Copy/ }));
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("cde-42-restore-fork-pages"));
	});

	// WT-56. The creator is the actor of the `created` activity row; the last
	// actor comes from the summary. Four minutes is inside the live window.
	test("Created and Updated render the actor chips with the live dot", async () => {
		const server = createFakeServer();
		findTicket(server.state, "CDE-42")!.createdAt = ago(3 * hour);
		touchedByAgent(server, 4 * minute);
		mount("CDE-42", server);
		const created = await row("Created");
		await waitFor(() => expect(within(created).getByRole("img", { name: "navid" })).toBeDefined());
		expect(created.textContent).toContain("3h");
		expect(created.querySelector("[data-live]")).toBeNull();
		const updated = await row("Updated");
		expect(within(updated).getByRole("img", { name: "claude-code · agent" })).toBeDefined();
		expect(within(updated).getByText("claude-code").className).toMatch(/\bfont-mono\b/);
		expect(updated.textContent).not.toContain("· agent");
		expect(updated.textContent).toContain("4m");
		expect(updated.querySelector("[data-live]")).not.toBeNull();
	});

	// WT-57
	test("the live dot is absent after 5 minutes", async () => {
		const server = createFakeServer();
		touchedByAgent(server, 40 * minute);
		mount("CDE-42", server);
		const updated = await row("Updated");
		expect(within(updated).getByRole("img", { name: "claude-code · agent" })).toBeDefined();
		await settle();
		expect(updated.querySelector("[data-live]")).toBeNull();
	});
});
