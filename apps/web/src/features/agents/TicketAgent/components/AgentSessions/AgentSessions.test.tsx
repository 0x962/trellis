import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { addSession, enableAgents, failedSession, startReason, updateSession } from "../../../../../../test/agents";
import { mockMatchMedia } from "../../../../../../test/media";
import { ticketId } from "../../../../../../test/rows";
import { createTestServer, type TestServer } from "../../../../../../test/server";
import { minute, renderTicket } from "../../../../../../test/ticketHost";
import { TicketAgent } from "../../TicketAgent";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = (server: TestServer) =>
	renderTicket("CDE-42", (ticket) => <TicketAgent ticket={ticket.identifier} />, { server });

// The one agent section of the rail. The sessions sit inside it, under its
// Agent heading.
const section = async () => screen.findByRole("region", { name: "Agent assignment" });

const items = async () => within(await section()).findAllByRole("listitem");
const startButton = async () => within(await section()).queryByRole("button", { name: "Start builder" });
const findStartButton = async () => within(await section()).findByRole("button", { name: "Start builder" });

describe("AgentSessions", () => {
	test("the sessions sit under the Agent heading, and the section names agents once", async () => {
		mount(createTestServer());
		const agent = await section();
		expect(within(agent).getByRole("heading", { level: 3 }).textContent).toBe("Agent");
		expect(await within(agent).findByText("None")).toBeDefined();
		expect(screen.queryByText("Agents", { selector: "dt" })).toBeNull();
	});

	test("lists the builder and the reviewer with their names and their states", async () => {
		const server = createTestServer();
		await addSession(server, { role: "builder", createdAt: new Date(Date.now() - 10 * minute).toISOString() });
		await addSession(server, {
			role: "reviewer",
			state: "waiting",
			terminalId: "term-2",
			openUrl: "superset://workspace/ws-1?terminal=term-2",
		});
		mount(server);
		const rows = await items();
		expect(rows.map((row) => row.textContent)).toEqual(["KenjiBuilderRunning", "NadiaReviewerWaiting"]);
	});

	test("offers Start builder when no builder runs, and starts one", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await enableAgents(server);
		mount(server);
		expect(await within(await section()).findByText("None")).toBeDefined();
		const start = await findStartButton();
		// The base layer of @trellis/ui sets the pointer cursor on every
		// enabled button, so the control has to be a button element.
		expect(start.tagName).toBe("BUTTON");
		expect(start.hasAttribute("disabled")).toBe(false);
		await user.click(start);
		await waitFor(() => expect(server.callsTo("agents.startBuilder")).toHaveLength(1));
		expect(server.callsTo("agents.startBuilder")[0]!.input).toEqual({ ticket: "CDE-42" });
		// The server picks a free name of the pool at random, so the row is
		// the name it picked and then the role and the state.
		await waitFor(async () => expect(await items()).toHaveLength(1));
		expect((await items())[0]!.textContent).toMatch(/^\w+BuilderStarting$/);
		expect(await startButton()).toBeNull();
	});

	test("hides Start builder while a builder starts, runs, or waits", async () => {
		for (const state of ["starting", "running", "waiting"] as const) {
			const server = createTestServer();
			await addSession(server, { role: "builder", state });
			const view = mount(server);
			await items();
			expect(await startButton()).toBeNull();
			view.unmount();
		}
	});

	test("offers Start builder again after the builder exited", async () => {
		const server = createTestServer();
		await addSession(server, { role: "builder", state: "exited" });
		mount(server);
		await items();
		expect(await startButton()).not.toBeNull();
	});

	test("a refused start names the builder limit", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await enableAgents(server, "CDE", { maxConcurrent: 1 });
		await addSession(server, { role: "builder", ticketId: await ticketId(server, "CDE-44"), title: "CDE-44" });
		mount(server);
		await user.click(await findStartButton());
		expect(await screen.findByText("Limit reached: 1 of 1 builders run.")).toBeDefined();
	});

	test("a start with agents off names the setting", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		mount(server);
		await user.click(await findStartButton());
		expect(await screen.findByText("Agents are off. Turn them on in Settings.")).toBeDefined();
	});

	test("follows an agents.session event", async () => {
		const server = createTestServer();
		const builder = await addSession(server, { role: "builder" });
		const { queryClient } = mount(server);
		await items();
		expect(await startButton()).toBeNull();
		createEventApplier(queryClient).applyEvent(await updateSession(server, builder.id, { state: "exited" }));
		await waitFor(async () => expect((await items()).map((row) => row.textContent)).toEqual(["KenjiBuilderExited"]));
		expect(await startButton()).not.toBeNull();
	});

	test("a failed builder shows Failed with its short reason and a link to the full error, and Start builder stays", async () => {
		const server = createTestServer();
		const failed = await failedSession(server, "builder");
		mount(server);
		const [row] = await items();
		expect(within(row!).getByText("Failed")).toBeDefined();
		expect(within(row!).getByText(startReason)).toBeDefined();
		expect(within(row!).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/agents#${failed.id}`);
		expect(await startButton()).not.toBeNull();
	});
});
