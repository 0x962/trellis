import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { fail } from "../../../../../test/fake-server/fail";
import { createFakeScheduler } from "../../../../../test/fakeScheduler";
import {
	addArchivedStatus,
	focusRow,
	gatedServer,
	lastCallTo,
	rowOf,
	statusOf,
	waitForElement,
} from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ReviewSection } from "./ReviewSection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer, extras: { scheduler?: ReturnType<typeof createFakeScheduler>["scheduler"] } = {}) =>
	renderWithProviders(
		<>
			<Toaster />
			<ReviewSection />
		</>,
		{ path: "/needs-you", actor: "navid", server, ...extras },
	);

// The identifiers the rendered rows carry, top to bottom.
const renderedOrder = () => screen.getAllByRole("row").map((row) => row.getAttribute("data-inbox-row"));

const reviewCount = () => screen.getByRole("button", { name: /^Review/ }).textContent;

describe("ReviewSection", () => {
	// NY-06. The server sorts by time in status. The client renders what it
	// is given, so the two never disagree.
	test("keeps the server order, oldest waiting first", async () => {
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		render(server);
		await screen.findByText(inbox.review.items[0]!.identifier);
		expect(renderedOrder()).toEqual(inbox.review.items.map((item) => item.identifier));
	});

	// NY-09. Nothing on the row is hover-only.
	test("exposes Approve, Send back, and Open PR to the keyboard on the focused row", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		const names: string[] = [];
		for (let step = 0; step < 3; step += 1) {
			await user.tab();
			names.push(document.activeElement?.textContent ?? "");
		}
		expect(names).toEqual(["Approve", "Send back", "Open PR"]);
	});

	// NY-10. TRL-9 carries no pull request, so it offers no Open PR.
	test("shows Open PR only for a row with a pull request", async () => {
		const server = createFakeServer();
		const [pr] = await server.client.pullRequests.list({ ticket: "CDE-42" });
		render(server);
		await rowOf("CDE-42");
		const link = (await waitForElement('[data-inbox-row="CDE-42"] a[data-open-pr]')) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(pr!.url);
		expect(link.getAttribute("target")).toBe("_blank");
		expect((await rowOf("TRL-9")).querySelector("a[data-open-pr]")).toBeNull();
	});

	// NY-11. CDE owns Done at position 4 and Archived at position 6, so the
	// approval lands on Done.
	test("approves the focused row into the lowest-position done status", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await addArchivedStatus(server);
		const done = await statusOf(server, "CDE", "done");
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("a");
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-42", status: done.id });
	});

	// NY-14
	test("the Approve button sends the same move as a", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("a");
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		const byKey = lastCallTo(server, "tickets.move")!.input as Record<string, unknown>;
		const row = await rowOf("CDE-37");
		await user.click(row.querySelector<HTMLButtonElement>("button[data-approve]")!);
		await waitFor(() => expect(lastCallTo(server, "tickets.move")!.input).not.toEqual(byKey));
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ...byKey, ticket: "CDE-37" });
	});

	// NY-15. The count ticks down with the row, not with the response.
	test("removes the approved row and ticks the section count down at once", async () => {
		const user = userEvent.setup();
		const gate = gatedServer(createFakeServer());
		const { queryClient, orpc } = render(gate.server);
		await focusRow("CDE-42");
		expect(reviewCount()).toContain("3");
		gate.hold();
		await user.keyboard("a");
		await waitFor(() => expect(screen.queryByText("CDE-42")).toBeNull());
		expect(reviewCount()).toContain("2");
		const cached = queryClient.getQueryData(orpc.inbox.get.queryKey({ input: {} })) as { review: { total: number } };
		expect(cached.review.total).toBe(2);
		gate.release();
	});

	// NY-16. The row collapses over the sweep duration and then leaves. The
	// timer is the app scheduler, so the test drives it.
	test("sweeps the approved row out over 200 ms", async () => {
		const user = userEvent.setup();
		const clock = createFakeScheduler();
		const server = createFakeServer();
		render(server, { scheduler: clock.scheduler });
		const row = await focusRow("CDE-42");
		await user.keyboard("a");
		expect(row.getAttribute("data-sweeping")).toBe("");
		expect(row.getAttribute("class")).toContain("duration-sweep");
		clock.advanceTo(199);
		expect(screen.queryByText("CDE-42")).not.toBeNull();
		clock.advanceTo(200);
		await waitFor(() => expect(screen.queryByText("CDE-42")).toBeNull());
	});

	// NY-17
	test("removes the approved row instantly under reduced motion", async () => {
		mockMatchMedia(true);
		const user = userEvent.setup();
		const clock = createFakeScheduler();
		const server = createFakeServer();
		render(server, { scheduler: clock.scheduler });
		await focusRow("CDE-42");
		await user.keyboard("a");
		expect(screen.queryByText("CDE-42")).toBeNull();
		expect(clock.pendingTimers()).toBe(0);
	});

	// NY-19. The next row takes the focus, so ten approvals need ten keys.
	test("moves focus to the next row after an approval", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("a");
		await waitFor(() => expect(screen.queryByText("CDE-42")).toBeNull());
		await waitFor(async () => expect(document.activeElement).toBe(await rowOf("CDE-37")));
	});

	// NY-20. The row and the count come back, and the toast names the ticket
	// and the target.
	test("restores the row and the count when the move fails", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		server.failNext("tickets.move", fail("STATUS_NOT_IN_PROJECT", { valid: [] }));
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("a");
		expect(await screen.findByText("Couldn't move CDE-42 to Done")).toBeDefined();
		expect(await screen.findByText("The status is not in the ticket's effective status set.")).toBeDefined();
		expect(await screen.findByRole("button", { name: "Retry" })).toBeDefined();
		await waitFor(() => expect(screen.queryByText("CDE-42")).not.toBeNull());
		expect(reviewCount()).toContain("3");
	});

	// NY-21. `a` is a row key, not a text key.
	test("does not approve while the comment box has focus", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		const box = await screen.findByRole("textbox", { name: /What should change/i });
		await user.type(box, "a");
		expect((box as HTMLTextAreaElement).value).toBe("a");
		expect(lastCallTo(server, "tickets.move")).toBeUndefined();
	});

	// NY-22
	test("announces the approval in a live region", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		renderWithProviders(<ReviewSection />, { path: "/needs-you", actor: "navid", server });
		await focusRow("CDE-42");
		await user.keyboard("a");
		await waitFor(() => expect(screen.getByRole("status").textContent).toBe("CDE-42 approved"));
	});

	// NY-28. A send back clears the row the same way an approval does.
	test("sweeps the row out and ticks the count down after a send back", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		const box = await screen.findByRole("textbox", { name: /What should change/i });
		await user.type(box, "Fix the migration");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(screen.queryByText("CDE-42")).toBeNull());
		expect(reviewCount()).toContain("2");
	});
});
