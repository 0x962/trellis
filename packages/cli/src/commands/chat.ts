import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
	type ChatChannel,
	ChatListInputSchema,
	type ChatMessage,
	ChatProjectInputSchema,
	type ChatUploadOutput,
} from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText, toNumber } from "../context.ts";
import { fileNotFound, fileUnreadable } from "../errors.ts";
import { cell, json, type ListSpec, printList, printRecord, type RecordSpec, timeCell } from "../output.ts";

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

// `#ai Sep 09, 2026 at 08:34:56 AM EDT <Builder 01J...> body`: the IRC form
// a terminal reader scans. Every other mode prints the message records.
export const renderChatLine = (message: ChatMessage) =>
	`#${message.channel} ${shortZonedDateTime(message.createdAt)} <${sender(message)}> ${message.body}\n`;

const messageRecord: RecordSpec<ChatMessage> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "channel", value: (row) => `#${row.channel}` },
		{ name: "actor", value: (row) => `${row.actor.kind}:${sender(row)}` },
		{ name: "created", value: (row) => shortZonedDateTime(row.createdAt) },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

const channelList: ListSpec<ChatChannel> = {
	columns: [
		{ name: "channel", value: (row) => `#${row.name}` },
		{ name: "agents-only", value: (row) => (row.aiOnly ? "yes" : "-") },
		{ name: "messages", value: (row) => String(row.messageCount) },
		{ name: "last", value: (row) => timeCell(row.lastMessageAt) },
	],
	identifier: (row) => row.name,
};

const channels = defineCommand({
	meta: { name: "channels", description: "Find channels in the project room" },
	args: {
		project: projectArg,
		search: { type: "string", description: "Find channel names that contain this text" },
		"ai-only": { type: "boolean", description: "Show only channels for agents" },
		direct: { type: "boolean", description: "Show only direct channels" },
		sort: {
			type: "string",
			description: "Sort by name, lastMessageAt, or messageCount. Add a leading - for descending order.",
		},
		limit: { type: "string", description: "Maximum channels to list, from 1 to 200" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const input = ChatProjectInputSchema.parse(
			compact({
				project: args.project,
				q: args.search,
				aiOnly: args["ai-only"] ? true : undefined,
				direct: args.direct ? true : undefined,
				sort: args.sort,
				limit: toNumber(args.limit),
			}),
		);
		const found = await clientOf(ctx).chat.channels(input);
		printList(ctx.out, ctx.format, found, channelList);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create a channel in the project room" },
	args: {
		project: projectArg,
		channel: channelArg,
		"ai-only": { type: "boolean", description: "Only agents post in the channel. A person reads it." },
	},
	async run(context) {
		const ctx = contextOf(context);
		const channel = await clientOf(ctx).chat.createChannel(
			compact({
				project: context.args.project,
				channel: context.args.channel,
				aiOnly: context.args["ai-only"] ? true : undefined,
			}),
		);
		printList(ctx.out, ctx.format, [channel], channelList);
	},
});

// The file the command line names. The file system is a boundary: a path
// the process cannot open ends the run with one line and no request.
const fileAt = (path: string): File => {
	try {
		return new File([readFileSync(path)], basename(path));
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT") throw fileNotFound(path);
		throw fileUnreadable(path, failure.message);
	}
};

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

const renderUpload = (result: ChatUploadOutput) =>
	`Uploaded ${result.attachment.filename} (${kilobytes(result.attachment.size)}) -> ${result.url}\n${result.markdown}\n`;

const attach = defineCommand({
	meta: { name: "attach", description: "Upload a file for a message; put the printed markdown in the body" },
	args: {
		project: projectArg,
		path: { type: "positional", required: true, description: "File path" },
		name: { type: "string", description: "Filename to store instead of the file's own" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).chat.upload(
			compact({ project: args.project, file: fileAt(args.path), name: args.name }),
		);
		switch (ctx.format.mode) {
			case "quiet":
				ctx.out.write(`${result.attachment.id}\n`);
				return;
			case "json":
			case "jsonl":
				ctx.out.write(json(result));
				return;
			case "table":
				ctx.out.write(renderUpload(result));
				return;
		}
	},
});

const read = defineCommand({
	meta: { name: "read", description: "List messages in a channel" },
	args: {
		project: projectArg,
		channel: channelArg,
		after: { type: "string", description: "Read only the messages after this message id" },
		actor: { type: "string", description: "Show messages from this actor name" },
		"actor-kind": { type: "string", description: "Show messages from a human, agent, or system actor" },
		search: { type: "string", description: "Find message bodies that contain this text" },
		"created-after": { type: "string", description: "Show messages after this ISO 8601 time" },
		"created-before": { type: "string", description: "Show messages before this ISO 8601 time" },
		sort: { type: "string", description: "Use createdAt for oldest first or -createdAt for newest first" },
		limit: { type: "string", description: "Messages to read, at most 200 (default 50)" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const input = ChatListInputSchema.parse(
			compact({
				project: args.project,
				channel: args.channel,
				after: args.after,
				actor: args.actor,
				actorKind: args["actor-kind"],
				q: args.search,
				createdAfter: args["created-after"],
				createdBefore: args["created-before"],
				sort: args.sort,
				limit: toNumber(args.limit),
			}),
		);
		const page = await clientOf(ctx).chat.list(input);
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
	subCommands: { channels, create, read, post, attach },
});
