import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { eventApplierFor, type Ticket } from "@trellis/api";
import { editorChunk } from "../../../../../../src/features/ticket/Description/components/LazyEditor";
import { Description } from "../../../../../../src/features/ticket/Description/Description";
import { summaryOf, updatedEvent } from "../../../../../events";
import { createFakeScheduler } from "../../../../../fakeScheduler";
import { captureIdle } from "../../../../../idle";
import { press } from "../../../../../keyboard";
import { patchTicket, ticketRow } from "../../../../../rows";
import { createTestServer, type TestServer } from "../../../../../server";
import { ago, hour, renderTicket, settle } from "../../../../../ticketHost";

let idle: ReturnType<typeof captureIdle>;

beforeEach(() => {
	localStorage.clear();
	idle = captureIdle();
});

afterEach(() => idle.restore());

const editor = () => screen.findByRole("textbox", { name: "Description" });
const rendered = () => waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());

const mount = (identifier: string, server: TestServer = createTestServer()) => {
	const clock = createFakeScheduler();
	const view = renderTicket(identifier, (ticket) => <Description ticket={ticket} />, {
		path: `/t/${identifier}`,
		server,
		scheduler: clock.scheduler,
	});
	return { ...view, ...clock };
};

// A 412 whose current row names the agent.
const armConflict = async (server: TestServer) => {
	const current = await server.client.tickets.get({ ticket: "CDE-42" });
	server.failNext("tickets.update", {
		code: "VERSION_CONFLICT",
		data: {
			current: {
				...current,
				version: current.version + 1,
				lastActor: { name: "claude-code", kind: "agent", at: ago(hour) },
			},
		},
	});
};

describe("features/ticket/Description", () => {
	// WT-33. The editor is a lazy chunk. The read-only view never asks for it.
	test("mounts no editor until the user asks for one", async () => {
		mount("CDE-42");
		await rendered();
		await settle();
		expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
		expect(document.querySelector("[contenteditable]")).toBeNull();
		expect(editorChunk.loads()).toBe(0);
		expect(editorChunk.state()).toBe("idle");
	});

	// WT-34
	test("e mounts the editor and focuses it", async () => {
		mount("CDE-42");
		await rendered();
		press("e");
		const element = await editor();
		await waitFor(() => expect(element.contains(document.activeElement)).toBe(true));
		expect(element.textContent).toContain("1.27");
	});

	// WT-35
	test("a click mounts the editor and focuses it", async () => {
		const user = userEvent.setup();
		mount("CDE-42");
		await rendered();
		await user.click(document.querySelector(".markdown")!);
		const element = await editor();
		await waitFor(() => expect(element.contains(document.activeElement)).toBe(true));
	});

	// WT-41. `descriptionStale` means an agent wrote the text since the page
	// read it. A save now would overwrite that work.
	test("refuses to save while descriptionStale is true", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { queryClient, orpc, advanceTo } = mount("CDE-42", server);
		await rendered();
		press("e");
		const element = await editor();
		await user.click(element);
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		act(() => {
			queryClient.setQueryData<Ticket>(key, (data) => ({ ...data!, descriptionStale: true }));
		});
		await user.keyboard(" More.");
		act(() => advanceTo(1000));
		await settle();
		expect(server.callsTo("tickets.update")).toHaveLength(0);
		expect(await screen.findByRole("button", { name: "Reload" })).toBeDefined();
	});

	// WT-42. Reload brings the server text; the flag is gone; the next
	// autosave reaches the server.
	test("Reload clears descriptionStale and saving works again", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { queryClient, orpc, advanceTo } = mount("CDE-42", server);
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		await rendered();
		act(() => {
			queryClient.setQueryData<Ticket>(key, (data) => ({ ...data!, descriptionStale: true }));
		});
		const reload = await screen.findByRole("button", { name: "Reload" });
		await patchTicket(server, "CDE-42", { description: "The agent rewrote this." });
		await user.click(reload);
		await waitFor(() => expect(document.querySelector(".markdown")!.textContent).toContain("The agent rewrote this."));
		expect(queryClient.getQueryData<Ticket>(key)!.descriptionStale).toBeUndefined();
		expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
		press("e");
		const element = await editor();
		await user.click(element);
		await user.keyboard(" More.");
		act(() => advanceTo(2000));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(1));
		const input = server.callsTo("tickets.update")[0]!.input as { description: string };
		expect(input.description).toContain("More.");
	});

	// WT-43. The chunk loads while the page idles, so the first `e` is fast.
	// Loading never mounts the editor, and a second idle asks for nothing.
	test("preloads the Tiptap chunk on idle exactly once", async () => {
		mount("CDE-42");
		await rendered();
		await waitFor(() => expect(idle.callbacks.length).toBeGreaterThan(0));
		expect(editorChunk.loads()).toBe(0);
		idle.callbacks[0]!();
		expect(editorChunk.loads()).toBe(1);
		await editorChunk.ready();
		expect(editorChunk.state()).toBe("ready");
		for (const callback of idle.callbacks) callback();
		expect(editorChunk.loads()).toBe(1);
		expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
	});

	// WT-46. A 412 keeps what the person typed; the notice names the agent.
	test("a 412 on the description shows the conflict notice and keeps the text", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await armConflict(server);
		const { advanceTo } = mount("CDE-42", server);
		await rendered();
		press("e");
		const element = await editor();
		await user.click(element);
		await user.keyboard(" Typed by dana.");
		act(() => advanceTo(1000));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(1));
		const notice = await screen.findByText(/changed this ticket .*\. Your edit is not saved\./);
		expect(notice.closest("[role=alert]")!.textContent).toContain("claude-code");
		expect(notice.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		expect(screen.getByRole("button", { name: "Use their version" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Keep mine" })).toBeDefined();
		expect((await editor()).textContent).toContain("Typed by dana.");
	});

	// Keep mine sends the held text again with no version guard, so the
	// server takes the person's text over the other writer's text.
	test("Keep mine sends tickets.update with no expectedVersion", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await armConflict(server);
		const { advanceTo } = mount("CDE-42", server);
		await rendered();
		press("e");
		const element = await editor();
		await user.click(element);
		await user.keyboard(" Typed by dana.");
		act(() => advanceTo(1000));
		await user.click(await screen.findByRole("button", { name: "Keep mine" }));
		await user.click(await screen.findByRole("button", { name: "Replace" }));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(2));
		const input = server.callsTo("tickets.update")[1]!.input as { description: string; expectedVersion?: number };
		expect(input.expectedVersion).toBeUndefined();
		expect(input.description).toContain("Typed by dana.");
		expect((await ticketRow(server, "CDE-42")).description).toContain("Typed by dana.");
	});

	// An agent rewrites the description while the editor is open. The
	// refetch after the event clears descriptionStale, and the editor still
	// holds the old text. The notice stays, and the next save meets the 412
	// and leaves the agent's text on the server.
	test("an open editor never overwrites a description an agent wrote while it was open", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { queryClient, orpc, advanceTo } = mount("CDE-42", server);
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		await rendered();
		press("e");
		const element = await editor();
		await user.click(element);
		const written = await server
			.clientAs("agent:claude-code")
			.tickets.update({ ticket: "CDE-42", description: "Agent text v2" });
		act(() => eventApplierFor(queryClient).applyEvent(updatedEvent(summaryOf(written), ["description"])));
		expect(await screen.findByText("claude-code changed the description.")).toBeDefined();
		await act(() => queryClient.refetchQueries({ queryKey: key }));
		expect(queryClient.getQueryData<Ticket>(key)!.descriptionStale).toBeUndefined();
		expect(screen.getByText("claude-code changed the description.")).toBeDefined();
		await user.click(element);
		await user.keyboard(" Second human words.");
		act(() => advanceTo(1000));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(2));
		expect(await screen.findByRole("button", { name: "Keep mine" })).toBeDefined();
		expect((await ticketRow(server, "CDE-42")).description).toBe("Agent text v2");
	});
});
