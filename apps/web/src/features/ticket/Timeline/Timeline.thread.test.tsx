import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEventApplier } from "@trellis/api";
import { createFakeServer } from "../../../../test/fake-server";
import { createFakeScheduler } from "../../../../test/fakeScheduler";
import { ago, hour, renderTicket } from "../../../../test/ticketHost";
import { Timeline } from "./Timeline";

beforeEach(() => localStorage.clear());

const setup = async () => {
	const server = createFakeServer();
	const ticket = await server.client.tickets.create({ project: "CDE", title: "Comment threads" });
	const root = await server.client.comments.create({ ticket: ticket.identifier, body: "Please check the layout." });
	server.state.comments.get(root.id)!.createdAt = ago(hour);
	const mount = () => renderTicket(ticket.identifier, (row) => <Timeline ticket={row} />, { server });
	return { server, ticket, root, mount };
};

describe("features/ticket/Timeline threads", () => {
	test("a reply appears under its root and keeps the main composer", async () => {
		const user = userEvent.setup();
		const { server, ticket, root, mount } = await setup();
		mount();
		await screen.findByText(root.body);
		await user.click(screen.getByRole("button", { name: "Reply" }));
		await user.type(screen.getByRole("textbox", { name: "Reply" }), "The layout is ready.");
		await user.click(screen.getByRole("button", { name: "Post reply" }));
		const replies = await screen.findByRole("list", { name: "Replies" });
		await within(replies).findByText("The layout is ready.");
		expect(server.callsTo("comments.create").at(-1)!.input).toEqual({
			ticket: ticket.identifier,
			parentId: root.id,
			body: "The layout is ready.",
		});
		expect(screen.getByRole("textbox", { name: "Comment" })).toBeDefined();
	});

	test("a resolved thread collapses and can be reopened", async () => {
		const user = userEvent.setup();
		const { server, ticket, root, mount } = await setup();
		await server.client.comments.create({ ticket: ticket.identifier, parentId: root.id, body: "The layout is ready." });
		mount();
		await screen.findByText(root.body);
		await user.click(screen.getByRole("button", { name: "Resolve thread" }));
		const resolved = await screen.findByRole("button", { name: /Resolved thread/ });
		expect(resolved.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("The layout is ready.")).toBeNull();
		await user.click(resolved);
		await screen.findByText("The layout is ready.");
		await user.click(screen.getByRole("button", { name: "Reopen thread" }));
		await screen.findByRole("button", { name: "Resolve thread" });
		expect(server.state.comments.get(root.id)!.resolvedAt).toBeNull();
	});

	test("a reply keeps its edit, copy, and delete actions", async () => {
		const user = userEvent.setup();
		const { server, ticket, root, mount } = await setup();
		const reply = await server.client.comments.create({
			ticket: ticket.identifier,
			parentId: root.id,
			body: "The draft reply.",
		});
		mount();
		const replies = await screen.findByRole("list", { name: "Replies" });
		await user.click(within(replies).getByRole("button", { name: "Comment actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
		await user.clear(screen.getByRole("textbox", { name: "Edit comment" }));
		await user.type(screen.getByRole("textbox", { name: "Edit comment" }), "The final reply.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await within(replies).findByText("The final reply.");
		expect(server.state.comments.get(reply.id)!.body).toBe("The final reply.");
		await user.click(within(replies).getByRole("button", { name: "Comment actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Copy markdown" }));
		expect(await navigator.clipboard.readText()).toBe("The final reply.");
		await user.click(within(replies).getByRole("button", { name: "Comment actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await waitFor(() =>
			expect(within(screen.getByRole("list", { name: "Comments" })).queryByText("The final reply.")).toBeNull(),
		);
		expect(server.state.comments.has(reply.id)).toBe(false);
		expect(screen.getByText(root.body)).toBeDefined();
	});

	test("a failed reply keeps the draft", async () => {
		const user = userEvent.setup();
		const { server, root, mount } = await setup();
		mount();
		await screen.findByText(root.body);
		await user.click(screen.getByRole("button", { name: "Reply" }));
		await user.type(screen.getByRole("textbox", { name: "Reply" }), "Keep this draft.");
		server.failNext("comments.create", { code: "PROJECT_ARCHIVED" });
		await user.click(screen.getByRole("button", { name: "Post reply" }));
		await screen.findByText("The project is archived. Unarchive it before a change.");
		expect((screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("Keep this draft.");
	});

	test("consecutive comments keep the author accessible without a repeated name", async () => {
		const { server, ticket, root, mount } = await setup();
		await server.client.comments.create({ ticket: ticket.identifier, body: "A second note." });
		mount();
		await screen.findByText(root.body);
		const comments = screen.getByRole("list", { name: "Comments" });
		expect(within(comments).getAllByText("navid")).toHaveLength(1);
		expect(within(comments).getAllByRole("article", { name: "Comment by navid" })).toHaveLength(2);
	});

	test("a page with replies fetches the root and complete thread once", async () => {
		const { server, ticket, root, mount } = await setup();
		for (let index = 0; index < 105; index++) {
			await server.client.comments.create({ ticket: ticket.identifier, parentId: root.id, body: `Reply ${index}` });
		}
		mount();
		await screen.findByText(root.body);
		const replies = await screen.findByRole("list", { name: "Replies" });
		await waitFor(() => expect(within(replies).getAllByRole("article")).toHaveLength(105));
		expect(server.callsTo("comments.thread")).toHaveLength(1);
		expect(screen.getAllByText(root.body)).toHaveLength(1);
	});

	test("a thread outside the loaded page retains local resolution changes", async () => {
		const user = userEvent.setup();
		const { server, ticket, root, mount } = await setup();
		for (let index = 0; index < 105; index++) {
			await server.client.comments.create({ ticket: ticket.identifier, parentId: root.id, body: `Reply ${index}` });
		}
		mount();
		await screen.findByText(root.body);
		await user.click(screen.getByRole("button", { name: "Resolve thread" }));
		await user.click(await screen.findByRole("button", { name: /Resolved thread/ }));
		await user.click(screen.getByRole("button", { name: "Reopen thread" }));
		await screen.findByRole("button", { name: "Resolve thread" });
		expect(server.state.comments.get(root.id)!.resolvedAt).toBeNull();
	});

	test("live replies refresh a thread whose root is outside the loaded page", async () => {
		const { server, ticket, root, mount } = await setup();
		for (let index = 0; index < 105; index++) {
			await server.client.comments.create({ ticket: ticket.identifier, parentId: root.id, body: `Reply ${index}` });
		}
		const { queryClient } = mount();
		await screen.findByText(root.body);
		const clock = createFakeScheduler();
		const applier = createEventApplier(queryClient, { scheduler: clock.scheduler });
		const reply = await server.client.comments.create({
			ticket: ticket.identifier,
			parentId: root.id,
			body: "A live reply.",
		});
		act(() => applier.applyEvent({ type: "comment.created", id: reply.id, ticketId: ticket.id }));
		act(() => clock.advanceTo(1000));
		await screen.findByText(reply.body);
		expect(screen.getAllByText(reply.body)).toHaveLength(1);
		await server.client.comments.delete({ id: reply.id });
		act(() => applier.applyEvent({ type: "comment.deleted", id: reply.id, ticketId: ticket.id }));
		act(() => clock.advanceTo(2000));
		await waitFor(() => expect(screen.queryByText(reply.body)).toBeNull());
	});
});
