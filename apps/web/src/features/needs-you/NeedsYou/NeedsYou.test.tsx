import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier, INBOX_MAX_WAIT_MS } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { callsTo, flakyServer, focusRow, gatedServer, rowOf, waitForElement } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { createHarness, renderApp, renderWithProviders } from "../../../../test/renderWithProviders";
import { NeedsYou } from "./NeedsYou";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const sections = ["Review", "Failing checks", "Stalled", "Done by agents today"];

// The height class an element carries. happy-dom runs no layout, so the
// class that sets the height is what a test can compare.
const heightClass = (element: Element) =>
	(element.getAttribute("class") ?? "").split(/\s+/).find((name) => /^h-\d/.test(name));

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<NeedsYou />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

describe("NeedsYou", () => {
	// NY-01. The order is fixed: what waits on a person first, awareness last.
	test("renders the four sections in the fixed order with their totals", async () => {
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		render(server);
		const headers = await waitFor(() => {
			const found = screen.getAllByRole("button", { name: new RegExp(`^(${sections.join("|")})`) });
			expect(found).toHaveLength(4);
			return found;
		});
		expect(headers.map((header, index) => header.textContent?.startsWith(sections[index]!))).toEqual([
			true,
			true,
			true,
			true,
		]);
		const totals = [inbox.review, inbox.failingCi, inbox.stalled, inbox.doneByAgentsToday].map(
			(section) => section.total,
		);
		for (const [index, header] of headers.entries()) {
			expect(within(header).getByText(String(totals[index]))).toBeDefined();
		}
	});

	// NY-02. The home screen is every project at once.
	test("reads inbox.get once with no project filter", async () => {
		const server = createFakeServer();
		const { queryClient, orpc } = render(server);
		await screen.findByRole("button", { name: /^Review/ });
		const calls = callsTo(server, "inbox.get");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.input).toEqual({});
		expect(queryClient.getQueryData(orpc.inbox.get.queryKey({ input: {} }))).toBeDefined();
	});

	// NY-03. A skeleton the size of a row keeps the page from jumping when
	// the rows arrive, and a cached page never flashes one.
	test("shows row-shaped skeletons cold and none on a cached mount", async () => {
		const gate = gatedServer(createFakeServer());
		gate.hold();
		const harness = createHarness({ path: "/needs-you", actor: "navid", server: gate.server });
		const first = renderWithProviders(<NeedsYou />, { path: "/needs-you", actor: "navid", harness });
		const skeleton = await waitForElement("[data-skeleton-row]");
		const skeletonHeight = heightClass(skeleton);
		gate.release();
		const row = await rowOf("CDE-42");
		expect(skeletonHeight).toBeDefined();
		expect(skeletonHeight).toBe(heightClass(row));
		first.unmount();
		renderWithProviders(<NeedsYou />, { path: "/needs-you", actor: "navid", harness });
		expect(document.querySelector("[data-skeleton-row]")).toBeNull();
	});

	// NY-04
	test("shows an error state with Retry when inbox.get fails", async () => {
		const user = userEvent.setup();
		const server = flakyServer(createFakeServer(), 1);
		render(server);
		expect(await screen.findByText(/did not load/i)).toBeDefined();
		const retry = await screen.findByRole("button", { name: "Retry" });
		await user.click(retry);
		await screen.findByRole("button", { name: /^Review/ });
		expect(callsTo(server, "inbox.get")).toHaveLength(1);
	});

	// NY-05. The count is the distinct tickets of Review and Failing checks
	// (D13), and the time says how fresh the page is without a refetch.
	test("shows the live count and the fetched-ago time in the header", async () => {
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		const harness = createHarness({ path: "/needs-you", actor: "navid", server });
		harness.queryClient.setQueryData(harness.orpc.inbox.get.queryKey({ input: {} }), inbox, {
			updatedAt: Date.now() - 12_000,
		});
		renderWithProviders(<NeedsYou />, { path: "/needs-you", actor: "navid", harness });
		const heading = await screen.findByRole("heading", { name: /Needs you/ });
		const count = within(heading).getByText("4");
		// Spec NY-3: the fetched time is the tooltip of the count.
		await userEvent.setup().hover(count);
		expect(await screen.findByText("Fetched 12s ago", undefined, { timeout: 3000 })).toBeDefined();
	});

	// NY-18. An approved ticket leaves Review, so the badge falls with the row.
	test("decrements the Needs you badge after an approval", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		renderApp({ path: "/needs-you", actor: "navid", server });
		const link = await screen.findByRole("link", { name: /Needs you/ });
		await waitFor(() => expect(within(link).getByText("4")).toBeDefined());
		await focusRow("CDE-42");
		await user.keyboard("a");
		await waitFor(() => expect(within(link).getByText("3")).toBeDefined());
	});

	// NY-48. The line means nothing waits, not that nothing happened.
	test("hides the empty line while any section holds rows", async () => {
		const server = createFakeServer({ empty: true });
		await server.client.projects.create({ key: "DOC", name: "Docs" });
		const agent = server.clientAs("agent:claude-code");
		const ticket = await agent.tickets.create({ project: "DOC", title: "Ship the poller" });
		await agent.tickets.move({ ticket: ticket.identifier, status: "done", force: true });
		render(server);
		expect(await screen.findByRole("button", { name: /^Done by agents today/ })).toBeDefined();
		expect(screen.queryByText(/Nothing needs you/)).toBeNull();
	});

	// NY-51. A title change reaches the row from the event, so no list
	// refetches for it.
	test("patches a listed row from a live event without a refetch", async () => {
		const server = createFakeServer();
		const { queryClient } = render(server);
		await rowOf("CDE-42");
		const summary = (await server.client.inbox.get({})).review.items.find((item) => item.identifier === "CDE-42")!;
		// The test reads the seed through the same server as the page, and
		// the server counts that read too. The count starts after every
		// setup read, so only the calls after the event decide the result.
		const before = callsTo(server, "inbox.get").length;
		const applier = createEventApplier(queryClient);
		applier.applyEvent({
			type: "ticket.updated",
			summary: { ...summary, title: "Restore the fork pages, again", version: summary.version + 1 },
			fields: ["title"],
			batchId: "01J8Z6X4Q3M2K1H0G9F8E7D6C5",
		});
		await screen.findByText("Restore the fork pages, again");
		// The event carries the new title, so the page reads no new inbox.
		expect(callsTo(server, "inbox.get")).toHaveLength(before);
	});

	// NY-52. A status change can move a row out of a section, so the
	// sections re-read once the coalescer window closes.
	test("invalidates the inbox once after a status event", async () => {
		const clock = createFakeScheduler();
		const server = createFakeServer();
		const { queryClient } = render(server);
		await rowOf("CDE-42");
		const before = callsTo(server, "inbox.get").length;
		const summary = (await server.client.inbox.get({})).review.items.find((item) => item.identifier === "CDE-42")!;
		const applier = createEventApplier(queryClient, { scheduler: clock.scheduler });
		applier.applyEvent({
			type: "ticket.updated",
			summary: { ...summary, version: summary.version + 1 },
			fields: ["status"],
			batchId: "01J8Z6X4Q3M2K1H0G9F8E7D6C5",
		});
		clock.advanceTo(INBOX_MAX_WAIT_MS);
		await waitFor(() => expect(callsTo(server, "inbox.get")).toHaveLength(before + 1));
	});

	// NY-53. One walk over the page, section borders and all.
	test("walks focus with j and k across sections and skips collapsed ones", async () => {
		const user = userEvent.setup();
		render(createFakeServer());
		await user.click(await screen.findByRole("button", { name: /^Stalled/ }));
		await focusRow("CDE-42");
		const walked: (string | null)[] = [];
		for (let step = 0; step < 4; step += 1) {
			await user.keyboard("j");
			walked.push((document.activeElement as HTMLElement).getAttribute("data-inbox-row"));
		}
		expect(walked).toEqual(["CDE-37", "TRL-9", "CDE-44", "CDE-44"]);
		await user.keyboard("k");
		expect((document.activeElement as HTMLElement).getAttribute("data-inbox-row")).toBe("TRL-9");
	});

	// NY-54
	test("opens the peek on Enter and the full page on o", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server: createFakeServer() });
		await focusRow("CDE-42");
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.href).toBe("/needs-you?peek=CDE-42"));
		await user.keyboard("o");
		await waitFor(() => expect(router.state.location.href).toBe("/t/CDE-42"));
	});
});
