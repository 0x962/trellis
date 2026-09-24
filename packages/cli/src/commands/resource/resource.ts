import { ResourceAddInputSchema } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { fileAt } from "../../file.ts";
import { printList, printRecord } from "../../output.ts";
import { deletedRecord } from "../delete.ts";
import { printThread, printThreads } from "./resourceCommentText.ts";
import { resourceList, resourceRecord } from "./resourceText.ts";

const resourceKinds = ["doc", "link", "image", "file"] as const;
type ResourceKind = (typeof resourceKinds)[number];
type SourceFlag = "body" | "url" | "file";

type ResourceArgs = {
	epic: string;
	kind: ResourceKind;
	name: string;
	ticket?: string;
	body?: string;
	url?: string;
	file?: string;
};

const sourceFlags: Record<ResourceKind, SourceFlag> = {
	doc: "body",
	link: "url",
	image: "file",
	file: "file",
};

const validateSource = (args: ResourceArgs): void => {
	const expected = sourceFlags[args.kind];
	const supplied = (["body", "url", "file"] as const).filter((flag) => args[flag] !== undefined);
	const refused = supplied.find((flag) => flag !== expected);
	if (refused !== undefined) throw usageError(`${args.kind} resource does not take --${refused}`);
	if (!supplied.includes(expected)) throw usageError(`${args.kind} resource needs --${expected}`);
};

export const resourceInput = async (ctx: CliContext, args: ResourceArgs, readFile: (path: string) => File = fileAt) => {
	validateSource(args);
	const sharedFields = { epic: args.epic, kind: args.kind, name: args.name, ticket: args.ticket };
	switch (args.kind) {
		case "doc":
			return ResourceAddInputSchema.parse({ ...sharedFields, body: await readText(ctx, args.body!) });
		case "link":
			return ResourceAddInputSchema.parse({ ...sharedFields, url: args.url });
		case "image":
		case "file":
			return ResourceAddInputSchema.parse({ ...sharedFields, file: readFile(args.file!) });
	}
};

const add = defineCommand({
	meta: { name: "add", description: "Add a resource to an epic" },
	args: {
		epic: { type: "string", description: "Epic ref" },
		epicRef: { type: "positional", required: false, description: "Epic ref (legacy)" },
		kind: { type: "enum", options: [...resourceKinds], required: true, description: "Resource kind" },
		name: { type: "string", required: true, description: "Resource name" },
		ticket: { type: "string", description: "Ticket ref that uses the resource" },
		body: { type: "string", description: "Document body, or - for standard input" },
		url: { type: "string", description: "HTTP or HTTPS link" },
		file: { type: "string", description: "Image or file path" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const epic = context.args.epic ?? context.args.epicRef;
		if (!epic) throw usageError("--epic is required");
		const resource = await clientOf(ctx).resources.add(await resourceInput(ctx, { ...context.args, epic }));
		printRecord(ctx.out, ctx.format, resource, resourceRecord);
	},
});

const list = defineCommand({
	meta: { name: "list", description: "List the resources of an epic" },
	args: {
		epic: { type: "string", description: "Epic ref" },
		epicRef: { type: "positional", required: false, description: "Epic ref (legacy)" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const epic = context.args.epic ?? context.args.epicRef;
		if (!epic) throw usageError("--epic is required");
		const resources = await clientOf(ctx).resources.list({ epic });
		printList(ctx.out, ctx.format, resources, resourceList);
	},
});

const rm = defineCommand({
	meta: { name: "rm", description: "Remove a resource" },
	args: { id: { type: "positional", required: true, description: "Resource id" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).resources.remove({ id: context.args.id });
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

const comments = defineCommand({
	meta: { name: "comments", description: "List the comment threads of a document, with the commented text" },
	args: {
		resource: { type: "positional", required: true, description: "Document resource id" },
		all: { type: "boolean", description: "Include the resolved threads" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const threads = await clientOf(ctx).resourceComments.list({ resource: context.args.resource });
		printThreads(
			ctx.out,
			ctx.format,
			context.args.all === true ? threads : threads.filter((thread) => thread.resolved === null),
		);
	},
});

const reply = defineCommand({
	meta: { name: "reply", description: "Reply to a comment thread of a document" },
	args: {
		thread: { type: "positional", required: true, description: "Thread id" },
		body: { type: "string", required: true, description: "Reply text, or - for standard input" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const body = await readText(ctx, context.args.body);
		const thread = await clientOf(ctx).resourceComments.reply({ thread: context.args.thread, body });
		printThread(ctx.out, ctx.format, thread);
	},
});

const resolveCommand = (resolved: boolean) =>
	defineCommand({
		meta: {
			name: resolved ? "resolve" : "reopen",
			description: resolved ? "Resolve a comment thread of a document" : "Reopen a comment thread of a document",
		},
		args: { thread: { type: "positional", required: true, description: "Thread id" } },
		async run(context) {
			const ctx = contextOf(context);
			const thread = await clientOf(ctx).resourceComments.resolve({ thread: context.args.thread, resolved });
			printThread(ctx.out, ctx.format, thread);
		},
	});

export default defineCommand({
	meta: {
		name: "resource",
		description: "Add, list, or remove the resources of an epic, and answer document comments",
	},
	subCommands: {
		add,
		list,
		rm,
		comments,
		reply,
		resolve: resolveCommand(true),
		reopen: resolveCommand(false),
		comment: defineCommand({
			meta: { name: "comment", description: "Read and answer document comments" },
			subCommands: { list: comments, reply, resolve: resolveCommand(true), reopen: resolveCommand(false) },
		}),
	},
});
