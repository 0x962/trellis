import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "@trellis/ui";
import { ReviewThreadCard } from "@trellis/ui/review";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { useStoryState } from "../useStoryState";
import { openEdit, resolveThread, submitEdit, submitReply } from "./plays";

const message = {
	id: "thread-1",
	author: "Dana Lee",
	kind: "human",
	session: null,
	body: "Retain the selected tickets when the review closes.",
	createdAt: "2026-09-30T12:00:00Z",
	version: 1,
	reactions: [],
};
const thread = {
	...message,
	status: "open",
	resolvedBy: null,
	replies: [
		{
			...message,
			id: "reply-1",
			author: "Review agent",
			kind: "agent",
			body: "The current change retains the selection.",
		},
	],
};
const meta = {
	title: "Components/ReviewThreadCard",
	component: ReviewThreadCard,
	args: {
		thread,
		actor: "Dana Lee",
		anchor: "src/project.ts:42",
		renderBody: (body) => <p className="whitespace-pre-wrap">{body}</p>,
		onReply: async () => {},
		onResolve: async () => {},
		onEdit: async () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Reply, edit, resolve, reopen, react, or delete with local state. Named stories open the edit form and submit pending or failed local actions.",
			},
		},
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.thread);
		const [deleted, setDeleted] = useState(false);
		if (deleted) return <EmptyState image={null} title="The thread is deleted" />;
		return (
			<ReviewThreadCard
				{...args}
				thread={value}
				onReply={async (body) => {
					await args.onReply(body);
					setValue({
						...value,
						replies: [...value.replies, { ...message, id: `reply-${value.replies.length + 1}`, body }],
					});
				}}
				onResolve={async () => {
					await args.onResolve();
					setValue({
						...value,
						status: value.status === "resolved" ? "open" : "resolved",
						resolvedBy: value.status === "resolved" ? null : "Dana Lee",
					});
				}}
				onEdit={async (id, body, version) => {
					await args.onEdit(id, body, version);
					setValue(
						id === value.id
							? { ...value, body, version: version + 1 }
							: {
									...value,
									replies: value.replies.map((reply) =>
										reply.id === id ? { ...reply, body, version: version + 1 } : reply,
									),
								},
					);
				}}
				onReaction={async (id, reaction, remove) => {
					const update = (entry: typeof value) => ({
						...entry,
						reactions: remove
							? entry.reactions.filter((item) => item.reaction !== reaction)
							: [...entry.reactions, { reaction, author: "Dana Lee", kind: "human" }],
					});
					if (id === value.id) setValue(update(value));
					else
						setValue({
							...value,
							replies: value.replies.map((reply) =>
								reply.id === id
									? {
											...reply,
											reactions: remove
												? reply.reactions.filter((item) => item.reaction !== reaction)
												: [...reply.reactions, { reaction, author: "Dana Lee", kind: "human" }],
										}
									: reply,
							),
						});
				}}
				onDelete={async (id) => {
					if (id === value.id) setDeleted(true);
					else setValue({ ...value, replies: value.replies.filter((reply) => reply.id !== id) });
				}}
			/>
		);
	},
} satisfies Meta<typeof ReviewThreadCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoReplies: Story = { args: { thread: { ...thread, replies: [] } } };
export const Resolved: Story = { args: { thread: { ...thread, status: "resolved", resolvedBy: "Dana Lee" } } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Outdated: Story = { args: { outdated: { lines: ["return oldSelection;"] } } };
export const DeliveryFailed: Story = {
	args: { thread: { ...thread, delivery: { state: "failed", error: "The agent does not receive the message." } } },
};
export const DeliveryPending: Story = { args: { thread: { ...thread, delivery: { state: "pending", error: null } } } };
export const DeliverySending: Story = { args: { thread: { ...thread, delivery: { state: "sending", error: null } } } };
export const DeliveryHeld: Story = { args: { thread: { ...thread, delivery: { state: "held", error: null } } } };
export const DeliverySent: Story = { args: { thread: { ...thread, delivery: { state: "sent", error: null } } } };
export const DeliveryUnknown: Story = { args: { thread: { ...thread, delivery: { state: "unknown", error: null } } } };
export const WithSession: Story = { args: { thread: { ...thread, session: "storybook-session" } } };
export const RestrictedChanges: Story = { args: { canChange: (id) => id === "reply-1" } };
export const OutdatedWithoutLines: Story = { args: { outdated: { lines: [] } } };
export const LongContent: Story = {
	args: { thread: { ...thread, body: "Retain the selected tickets when the review closes. ".repeat(50) } },
};
export const ReplyFailed: Story = {
	args: {
		onReply: async () => {
			throw new Error("The reply does not save.");
		},
	},
	play: async (context) => {
		await submitReply(context);
		await expect(await within(context.canvasElement).findByRole("alert")).toHaveTextContent("The reply does not save.");
	},
};
export const ReplyPending: Story = {
	args: { onReply: () => new Promise<void>(() => {}) },
	play: async (context) => {
		await submitReply(context);
		await waitFor(() =>
			expect(within(context.canvasElement).getByRole("button", { name: "Post reply" })).toBeDisabled(),
		);
	},
};
export const ReplySaved: Story = {
	play: async (context) => {
		await submitReply(context);
		await expect(await within(context.canvasElement).findByText("The change preserves the selection.")).toBeVisible();
		await expect(within(context.canvasElement).getByRole("textbox", { name: "Reply" })).toHaveValue("");
	},
};
export const Editing: Story = { play: openEdit };
export const EditSaved: Story = {
	play: async (context) => {
		await submitEdit(context);
		await expect(await within(context.canvasElement).findByText("Retain all selected tickets.")).toBeVisible();
	},
};
export const EditPending: Story = {
	args: { onEdit: () => new Promise<void>(() => {}) },
	play: async (context) => {
		await submitEdit(context);
		await waitFor(() => expect(within(context.canvasElement).getByRole("button", { name: "Save" })).toBeDisabled());
	},
};
export const EditFailed: Story = {
	args: {
		onEdit: async () => {
			throw new Error("The message does not save.");
		},
	},
	play: async (context) => {
		await submitEdit(context);
		await expect(await within(context.canvasElement).findByRole("alert")).toHaveTextContent(
			"The message does not save.",
		);
	},
};
export const ResolvePending: Story = {
	args: { onResolve: () => new Promise<void>(() => {}) },
	play: async (context) => {
		await resolveThread(context);
		await waitFor(() =>
			expect(within(context.canvasElement).getByRole("button", { name: "Resolve comment" })).toHaveAttribute(
				"aria-disabled",
				"true",
			),
		);
	},
};
export const ResolveFailed: Story = {
	args: {
		onResolve: async () => {
			throw new Error("The comment does not resolve.");
		},
	},
	play: async (context) => {
		await resolveThread(context);
		await expect(await within(context.canvasElement).findByRole("alert")).toHaveTextContent(
			"The comment does not resolve.",
		);
	},
};
