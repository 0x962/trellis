import { beforeEach, describe, expect, test } from "@jest/globals";
import type { Status, StatusSummary, Ticket } from "@trellis/api";
import { router } from "expo-router";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { appContext } from "../../test/appContext";
import { type FakeApp, installFakeApp } from "../../test/fakeApp";
import { ulid } from "../../test/fixtures";
import { instances } from "../../test/mocks/react-native-sse";

let app: FakeApp;
const tabs = ["Needs you", "Search", "Projects", "Settings"];

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;

const title = "Restore the fork pages after the upstream 1.27 merge";

const openTicket = async (identifier = "CDE-42") => {
	const view = renderRouter(appContext(), { initialUrl: `/ticket/${identifier}` });
	await view;
	await screen.findByText(title);
	return view;
};

const statusRow = () => screen.getByRole("button", { name: "Status" });
const priorityRow = () => screen.getByRole("button", { name: "Priority" });

// The `tickets.get` calls for CDE-42. The parent's detail is another call.
const detailCalls = () =>
	app.callsTo("tickets.get").filter((call) => (call.input as { ticket: string }).ticket.toUpperCase() === "CDE-42");

// The summary a `ticket.updated` event carries, from the detail the server
// holds, one version up.
const summaryOf = (detail: Ticket, overrides: Partial<Ticket> = {}) => {
	const { description, children, prs, attachments, ...summary } = { ...detail, ...overrides };
	return { ...summary, version: detail.version + 1 };
};

const statusSummary = ({ id, slug, name, category, reviewer, color }: Status): StatusSummary => ({
	id,
	slug,
	name,
	category,
	reviewer,
	color,
});

// Delivers one server event over the open stream, the way the server does.
const emit = async (type: string, data: unknown) => {
	const stream = instances.at(-1)!;
	await act(async () => {
		stream.emit(type, JSON.stringify(data));
	});
};

describe("the ticket route", () => {
	beforeEach(() => {
		app = installFakeApp();
	});

	// O21.
	test("renders every section of CDE-42", async () => {
		await openTicket();
		expect(screen.getByRole("button", { name: "Approve" })).toBeOnTheScreen();
		expect(screen.getByRole("button", { name: "Send back" })).toBeOnTheScreen();
		expect(within(statusRow()).getByText("Human Review")).toBeOnTheScreen();
		expect(within(priorityRow()).getByText("High")).toBeOnTheScreen();
		expect(screen.getByText("CDE.web")).toBeOnTheScreen();
		expect(screen.getByText("CDE-43")).toBeOnTheScreen();
		expect(screen.getByText(/The upstream 1\.27 merge dropped the five fork pages/)).toBeOnTheScreen();
		expect(screen.getByText("CDE-48")).toBeOnTheScreen();
		expect(screen.getByText("2 of 3")).toBeOnTheScreen();
		expect(screen.getByText("canary-technologies-corp/de #118")).toBeOnTheScreen();
		expect(screen.getByLabelText("4 pass")).toBeOnTheScreen();
		expect(screen.getByTestId("attachment-image")).toBeOnTheScreen();
		expect(await screen.findByText("Typecheck and tests are green on the PR. Ready for a look.")).toBeOnTheScreen();
		expect(screen.getByLabelText("Add a comment")).toBeOnTheScreen();
		expect(screen.getByRole("button", { name: "Send" })).toBeOnTheScreen();
	});

	// O22. FlashList renders one scroll view that carries its testID. The
	// sections above the timeline are the list header, so they sit inside it.
	test("the timeline is a FlashList and an activity row keeps a fixed height", async () => {
		await openTicket();
		await screen.findByText("Typecheck and tests are green on the PR. Ready for a look.");
		const list = screen.getByTestId("ticket-timeline");
		expect(list.type).toBe("RCTScrollView");
		expect(within(list).getByText(title)).toBeOnTheScreen();
		expect(within(list).getByText("canary-technologies-corp/de #118")).toBeOnTheScreen();
		const rows = within(list).getAllByTestId("activity-row");
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(row).toHaveStyle({ height: 32 });
	});

	// O23. The event patches the cached detail; nothing refetches it.
	test("a ticket.updated event patches the header without a second fetch", async () => {
		const detail = await app.server.client.tickets.get({ ticket: "CDE-42" });
		const { statuses } = await app.server.client.statuses.list({ project: detail.project.id });
		const inProgress = statuses.find((status) => status.slug === "in-progress")!;
		await openTicket();
		expect(detailCalls()).toHaveLength(1);
		const summary = summaryOf(detail, { status: statusSummary(inProgress), priority: "urgent" });
		await emit("ticket.updated", { summary, fields: ["status", "priority"], batchId: ulid });
		await waitFor(() => expect(within(statusRow()).getByText("In Progress")).toBeOnTheScreen());
		expect(within(priorityRow()).getByText("Urgent")).toBeOnTheScreen();
		// The applier refetches the timeline after a ticket event, so a second
		// timeline call proves the coalescer flushed while the detail stayed.
		await waitFor(() => expect(app.callsTo("timeline.list").length).toBeGreaterThan(1), { timeout: 2_000 });
		expect(detailCalls()).toHaveLength(1);
	});

	// O24.
	test("a description event shows the text updating hint until the refetch", async () => {
		const detail = await app.server.client.tickets.get({ ticket: "CDE-42" });
		await openTicket();
		await emit("ticket.updated", { summary: summaryOf(detail), fields: ["description"], batchId: ulid });
		expect(await screen.findByText("Text updating")).toBeOnTheScreen();
		expect(screen.getByText(/The upstream 1\.27 merge dropped the five fork pages/)).toBeOnTheScreen();
		await waitFor(() => expect(screen.queryByText("Text updating")).toBeNull(), { timeout: 2_000 });
		expect(detailCalls()).toHaveLength(2);
		expect(screen.getByText(/The upstream 1\.27 merge dropped the five fork pages/)).toBeOnTheScreen();
	});

	// O25.
	test("a comment.created event adds the comment to the timeline", async () => {
		const detail = await app.server.client.tickets.get({ ticket: "CDE-42" });
		await openTicket();
		await screen.findByText("Typecheck and tests are green on the PR. Ready for a look.");
		const comment = await app.server
			.clientAs("agent:claude-code")
			.comments.create({ ticket: "CDE-42", body: "New from the stream" });
		await emit("comment.created", { id: comment.id, ticketId: detail.id });
		expect(await screen.findByText("New from the stream", {}, { timeout: 2_000 })).toBeOnTheScreen();
	});

	// O26.
	test("a pr.updated event refreshes the check counts on the card", async () => {
		const detail = await app.server.client.tickets.get({ ticket: "CDE-42" });
		await openTicket();
		expect(screen.getByLabelText("4 pass")).toBeOnTheScreen();
		const pr = [...app.server.state.prs.values()].find((row) => row.number === 118)!;
		pr.checks[1]!.bucket = "fail";
		pr.ciState = "fail";
		await emit("pr.updated", { id: pr.id, ticketIds: [detail.id], state: "open", ciState: "fail" });
		expect(await screen.findByLabelText("3 pass · 1 fail", {}, { timeout: 2_000 })).toBeOnTheScreen();
		expect(screen.queryByLabelText("4 pass")).toBeNull();
	});

	// O27.
	test("an unknown identifier says the ticket does not exist", async () => {
		await renderRouter(appContext(), { initialUrl: "/ticket/CDE-999" });
		expect(await screen.findByText(/CDE-999 does not exist/)).toBeOnTheScreen();
		expect(screen.queryByLabelText("Add a comment")).toBeNull();
	});

	// O28. The ticket is a push over the tab the person came from: the header
	// carries the identifier and a back control, and the tab bar stays.
	test("the ticket route pushes a stack screen titled by the identifier", async () => {
		const view = renderRouter(appContext(), { initialUrl: "/" });
		await view;
		await act(async () => {
			router.push("/ticket/CDE-42");
		});
		expect(view.getPathname()).toBe("/ticket/CDE-42");
		expect(router.canGoBack()).toBe(true);
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
		expect(screen.getByLabelText(/back/i)).toBeOnTheScreen();
		for (const label of tabs) {
			expect(screen.getByRole(tabRole, { name: label })).toBeOnTheScreen();
		}
	});
});
