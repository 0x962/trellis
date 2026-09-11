import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@trellis/api";
import { press } from "../../../../test/keyboard";
import { mockMatchMedia } from "../../../../test/media";
import { statusesOf } from "../../../../test/rows";
import { createTestServer, type TestServer } from "../../../../test/server";
import { renderTicket, statusOf } from "../../../../test/ticketHost";
import { PropertiesRail } from "./PropertiesRail";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const rowOrder = ["Status", "Priority", "Project", "Parent"];

const mount = (identifier = "CDE-42", server: TestServer = createTestServer(), path = "/p/CDE/table") =>
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
const updates = (server: TestServer) => server.callsTo("tickets.update");
const cachedStatus = (view: ReturnType<typeof mount>) =>
	view.queryClient.getQueryData<Ticket>(view.orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } }))!.status.name;

describe("features/ticket/PropertiesRail", () => {
	// WT-47
	test("lists the property rows in the specified order", async () => {
		mount();
		const terms = within(await rail())
			.getAllByRole("term")
			.map((term) => term.textContent);
		expect(terms.slice(0, rowOrder.length)).toEqual(rowOrder);
	});

	// TRL-33. The rail named agents twice: the TicketAgent section carried an
	// Agent heading, and an Agents row followed it with a second stack. The
	// sessions now sit inside that one section.
	test("names agents once, in one section", async () => {
		mount();
		const properties = within(await rail());
		const headings = properties.getAllByRole("heading").map((heading) => heading.textContent);
		expect(headings.filter((heading) => heading === "Agent")).toEqual(["Agent"]);
		expect(headings.filter((heading) => heading === "Agents")).toEqual([]);
		expect(properties.queryByText("Agents", { selector: "dt" })).toBeNull();
		const section = properties.getByRole("region", { name: "Agent assignment" });
		expect(await within(section).findByText("None")).toBeDefined();
	});

	// WT-48
	test("the status picker paints the new status optimistically", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const hold = server.holdNext("tickets.update");
		const view = mount("CDE-42", server);
		await user.click(within(await row("Status")).getByRole("button", { name: /Human Review/ }));
		await user.click(within(await popover()).getByRole("option", { name: "In Progress" }));
		await waitFor(() => expect(within(screen.getByLabelText("Properties")).getByText("In Progress")).toBeDefined());
		expect(cachedStatus(view)).toBe("In Progress");
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect(statusOf(await statusesOf(server, "CDE"), updates(server)[0]!.input)!.name).toBe("In Progress");
		hold.release();
	});

	// WT-49. Rollback restores the snapshot; the toast carries the server's
	// message and a Retry.
	test("a failed status change rolls back and toasts with Retry", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
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
		const server = createTestServer();
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
		const server = createTestServer();
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
		const server = createTestServer();
		mount("CDE-42", server);
		await user.click(within(await row("Parent")).getByRole("button", { name: /CDE-43/ }));
		await user.click(within(await popover()).getByRole("option", { name: "None" }));
		await waitFor(() => expect(updates(server)).toHaveLength(1));
		expect((updates(server)[0]!.input as { parent: unknown }).parent).toBeNull();
		await waitFor(() => expect(rowNow("Parent").textContent).not.toContain("CDE-43"));
		expect(within(rowNow("Parent")).getByText("None")).toBeDefined();
	});
});
