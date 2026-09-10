import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { addSession, enableAgents, updateSession } from "../../../../../../test/agents";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { findTicket } from "../../../../../../test/fake-server/state";
import { mockMatchMedia } from "../../../../../../test/media";
import { minute, renderTicket } from "../../../../../../test/ticketHost";
import { PropertiesRail } from "../../PropertiesRail";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const mount = (server: FakeServer) =>
	renderTicket("CDE-42", (ticket) => <PropertiesRail ticket={ticket} variant="page" />, { server });

const terms = async () =>
	within(await screen.findByLabelText("Properties"))
		.getAllByRole("term")
		.map((term) => term.textContent);

// The value cell of the Agents row.
const agentsRow = async () => {
	const rail = within(await screen.findByLabelText("Properties"));
	const term = await rail.findByText("Agents", { selector: "dt" });
	return term.nextElementSibling as HTMLElement;
};

const items = async () => within(await agentsRow()).findAllByRole("listitem");
const startButton = async () => within(await agentsRow()).queryByRole("button", { name: "Start builder" });

describe("AgentsRow", () => {
	test("the rail shows the Agents row right after Updated", async () => {
		mount(createFakeServer());
		await agentsRow();
		const order = await terms();
		expect(order.indexOf("Agents")).toBe(order.indexOf("Updated") + 1);
	});

	test("lists the builder and the reviewer with their states and Open in Superset", async () => {
		const server = createFakeServer();
		addSession(server, { role: "builder", createdAt: new Date(Date.now() - 10 * minute).toISOString() });
		addSession(server, {
			role: "reviewer",
			state: "waiting",
			terminalId: "term-2",
			openUrl: "superset://workspace/ws-1?terminal=term-2",
		});
		mount(server);
		const rows = await items();
		expect(rows.map((row) => row.textContent)).toEqual([
			"BuilderRunningOpen in Superset",
			"ReviewerWaitingOpen in Superset",
		]);
		expect(within(rows[1]!).getByRole("link", { name: "Open in Superset" }).getAttribute("href")).toBe(
			"superset://workspace/ws-1?terminal=term-2",
		);
	});

	test("offers Start builder when no builder runs, and starts one", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await enableAgents(server);
		mount(server);
		expect(await within(await agentsRow()).findByText("None")).toBeDefined();
		const start = (await startButton())!;
		expect(start.className).toContain("cursor-pointer");
		await user.click(start);
		await waitFor(() => expect(server.callsTo("agents.startBuilder")).toHaveLength(1));
		expect(server.callsTo("agents.startBuilder")[0]!.input).toEqual({ ticket: "CDE-42" });
		await waitFor(async () =>
			expect((await items()).map((row) => row.textContent)).toEqual(["BuilderStartingOpen in Superset"]),
		);
		expect(await startButton()).toBeNull();
	});

	test("hides Start builder while a builder starts, runs, or waits", async () => {
		for (const state of ["starting", "running", "waiting"] as const) {
			const server = createFakeServer();
			addSession(server, { role: "builder", state });
			const view = mount(server);
			await items();
			expect(await startButton()).toBeNull();
			view.unmount();
		}
	});

	test("offers Start builder again after the builder exited", async () => {
		const server = createFakeServer();
		addSession(server, { role: "builder", state: "exited" });
		mount(server);
		await items();
		expect(await startButton()).not.toBeNull();
	});

	test("a refused start names the builder limit", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await enableAgents(server, "CDE", { maxConcurrent: 1 });
		addSession(server, { role: "builder", ticketId: findTicket(server.state, "CDE-44")!.id, title: "CDE-44" });
		mount(server);
		await user.click((await startButton())!);
		expect(await screen.findByText("Limit reached: 1 of 1 builders run.")).toBeDefined();
	});

	test("a start with agents off names the setting", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		mount(server);
		await user.click((await startButton())!);
		expect(await screen.findByText("Agents are off. Turn them on in Settings.")).toBeDefined();
	});

	test("a failed builder states the reason, offers Retry, and shows the runner's whole text", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await enableAgents(server);
		addSession(server, {
			role: "builder",
			state: "failed",
			failure: { reason: "error", exitCode: 1, detail: "fatal: invalid reference: main\nrun `git branch`" },
		});
		mount(server);
		const row = (await items())[0]!;
		expect(row.textContent).toContain("Failed");
		expect(row.textContent).toContain("Superset refused the start.");
		expect(row.textContent).toContain("fatal: invalid reference: main");

		await user.click(within(row).getByRole("button", { name: "Details" }));
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("Superset exited 1.");
		expect(dialog.textContent).toContain("run `git branch`");
		await user.keyboard("{Escape}");

		await user.click(within(row).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(server.callsTo("agents.retry")).toHaveLength(1));
		await waitFor(async () =>
			expect((await items()).map((item) => item.textContent)).toEqual(["BuilderStartingOpen in Superset"]),
		);
	});

	test("a builder that never started still offers Start builder", async () => {
		const server = createFakeServer();
		addSession(server, {
			role: "builder",
			state: "failed",
			failure: { reason: "missing", exitCode: null, detail: "" },
		});
		mount(server);
		const row = (await items())[0]!;
		expect(row.textContent).toContain("trellis cannot find the Superset CLI.");
		expect(await startButton()).not.toBeNull();
	});

	test("follows an agents.session event", async () => {
		const server = createFakeServer();
		const builder = addSession(server, { role: "builder" });
		const { queryClient } = mount(server);
		await items();
		expect(await startButton()).toBeNull();
		createEventApplier(queryClient).applyEvent(updateSession(server, builder.id, { state: "exited" }));
		await waitFor(async () =>
			expect((await items()).map((row) => row.textContent)).toEqual(["BuilderExitedOpen in Superset"]),
		);
		expect(await startButton()).not.toBeNull();
	});
});
