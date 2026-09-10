import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { createFakeScheduler } from "../../../../../../test/fakeScheduler";
import { captureIdle } from "../../../../../../test/idle";
import { press } from "../../../../../../test/keyboard";
import { renderTicket } from "../../../../../../test/ticketHost";
import { Description } from "../../Description";
import { editorChunk } from "./LazyEditor";

let idle: ReturnType<typeof captureIdle>;

beforeEach(() => {
	localStorage.clear();
	idle = captureIdle();
});

afterEach(() => idle.restore());

const placeholder = "Describe the work. Agents read this verbatim.";

const editor = () => screen.findByRole("textbox", { name: "Description" });

// The editor mounts inside the Description, which owns the `e` key and the
// read-only view it replaces.
const mount = (identifier: string, server: FakeServer) => {
	const clock = createFakeScheduler();
	const view = renderTicket(identifier, (ticket) => <Description ticket={ticket} />, {
		path: `/t/${identifier}`,
		server,
		scheduler: clock.scheduler,
	});
	return { ...view, ...clock };
};

const blank = (server: FakeServer) =>
	server.client.tickets.create({ project: "CDE.web", title: "Blank page", description: "" });

const opened = async () => {
	press("e");
	const element = await editor();
	await waitFor(() => expect(element.contains(document.activeElement)).toBe(true));
	return element;
};

describe("features/ticket/Description/components/LazyEditor", () => {
	// WT-36. Tiptap draws a placeholder from the attribute on the empty block.
	test("an empty description shows the agent placeholder", async () => {
		const server = createFakeServer();
		const ticket = await blank(server);
		mount(ticket.identifier, server);
		await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
		const element = await opened();
		const block = element.querySelector("[data-placeholder]");
		expect(block).not.toBeNull();
		expect(block!.getAttribute("data-placeholder")).toBe(placeholder);
	});

	// WT-44. One Tiptap instance serves every ticket: a second open sets its
	// content and never builds a second editor.
	test("reuses one editor instance across tickets", async () => {
		const server = createFakeServer();
		const first = mount("CDE-42", server);
		await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
		const before = editorChunk.instances();
		const element = await opened();
		expect(element.textContent).toContain("1.27");
		expect(editorChunk.instances()).toBe(before + 1);
		first.unmount();
		mount("CDE-43", server);
		await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
		const second = await opened();
		expect(second.textContent).toContain("Merge upstream 1.27 and keep every marked site");
		expect(document.querySelectorAll('[role="textbox"][aria-label="Description"]')).toHaveLength(1);
		expect(editorChunk.instances()).toBe(before + 1);
	});

	// WT-45. `/` opens the block menu; Code block inserts a fenced block that
	// the markdown save carries.
	test("the slash menu inserts a code block", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const ticket = await blank(server);
		const { advanceTo } = mount(ticket.identifier, server);
		await waitFor(() => expect(document.querySelector(".markdown")).not.toBeNull());
		const element = await opened();
		await user.keyboard("/");
		const menu = await screen.findByRole("listbox", { name: /Insert block/i });
		await user.click(screen.getByRole("option", { name: "Code block" }));
		await waitFor(() => expect(screen.queryByRole("listbox", { name: /Insert block/i })).toBeNull());
		expect(menu.isConnected).toBe(false);
		await waitFor(() => expect(element.querySelector("pre")).not.toBeNull());
		await user.keyboard("bun test");
		act(() => advanceTo(1000));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(1));
		const input = server.callsTo("tickets.update")[0]!.input as { description: string };
		expect(input.description).toMatch(/```[^\n]*\nbun test\n```/);
	});
});
