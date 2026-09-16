import type { ChatChannel, ChatMessage } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText, toNumber } from "../context.ts";
import { cell, json, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";

const projectArg = { type: "positional" as const, required: true as const, description: "Project ref, such as TRL" };
const channelArg = {
	type: "positional" as const,
	required: true as const,
	description: "Channel name, such as ai. A leading # is optional; quote it in a shell.",
};

const sender = (message: ChatMessage) =>
	message.actor.kind === "agent" && message.actor.displayName !== undefined
		? `${message.actor.displayName} ${message.actor.name}`
		: message.actor.name;

// `#ai 12:00:01 <Builder 01J...> body`: the IRC form a terminal reader
// scans. Every other mode prints the message records.
export const renderChatLine = (message: ChatMessage) =>
	`#${message.channel} ${message.createdAt.slice(11, 19)} <${sender(message)}> ${message.body}\n`;

const messageRecord: RecordSpec<ChatMessage> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "channel", value: (row) => `#${row.channel}` },
		{ name: "actor", value: (row) => `${row.actor.kind}:${sender(row)}` },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

const channelList: ListSpec<ChatChannel> = {
	columns: [
		{ name: "channel", value: (row) => `#${row.name}` },
		{ name: "messages", value: (row) => String(row.messageCount) },
		{ name: "last", value: (row) => cell(row.lastMessageAt) },
	],
	identifier: (row) => row.name,
};

const channels = defineCommand({
	meta: { name: "channels", description: "List the channels of the project room" },
	args: { project: projectArg },
	async run(context) {
		const ctx = contextOf(context);
		const found = await clientOf(ctx).chat.channels({ project: context.args.project });
		printList(ctx.out, ctx.format, found, channelList);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create a channel in the project room" },
	args: { project: projectArg, channel: channelArg },
	async run(context) {
		const ctx = contextOf(context);
		const channel = await clientOf(ctx).chat.createChannel({
			project: context.args.project,
			channel: context.args.channel,
		});
		printList(ctx.out, ctx.format, [channel], channelList);
	},
});

const read = defineCommand({
	meta: { name: "read", description: "Read the messages of a channel, oldest first" },
	args: {
		project: projectArg,
		channel: channelArg,
		after: { type: "string", description: "Read only the messages after this message id" },
		limit: { type: "string", description: "Messages to read, at most 200 (default 50)" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const page = await clientOf(ctx).chat.list(
			compact({ project: args.project, channel: args.channel, after: args.after, limit: toNumber(args.limit) }),
		);
		if (ctx.format.mode === "table") {
			ctx.out.write(
				page.items.length === 0 ? `#${page.channel} has no messages.\n` : page.items.map(renderChatLine).join(""),
			);
			return;
		}
		if (ctx.format.mode === "quiet") {
			ctx.out.write(page.items.map((message) => `${message.id}\n`).join(""));
			return;
		}
		if (ctx.format.mode === "jsonl") {
			ctx.out.write(page.items.map(json).join(""));
			return;
		}
		ctx.out.write(json(page));
	},
});

const post = defineCommand({
	meta: { name: "post", description: "Post a message to a channel" },
	args: {
		project: projectArg,
		channel: channelArg,
		body: { type: "string", required: true, description: "Message text, or - for stdin" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const message = await clientOf(ctx).chat.post({
			project: args.project,
			channel: args.channel,
			body: await readText(ctx, args.body),
		});
		printRecord(ctx.out, ctx.format, message, messageRecord);
	},
});

export default defineCommand({
	meta: { name: "chat", description: "Read and post in the chat room of a project" },
	subCommands: { channels, create, read, post },
});
