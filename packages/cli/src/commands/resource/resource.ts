import { ResourceAddInputSchema } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { fileAt } from "../../file.ts";
import { printList, printRecord, type RecordSpec } from "../../output.ts";
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

const sourceFlag: Record<ResourceKind, SourceFlag> = {
	doc: "body",
	link: "url",
	image: "file",
	file: "file",
};

const validateSource = (args: ResourceArgs): SourceFlag => {
	const expected = sourceFlag[args.kind];
	const supplied = (["body", "url", "file"] as const).filter((flag) => args[flag] !== undefined);
	const refused = supplied.find((flag) => flag !== expected);
	if (refused !== undefined) throw usageError(`${args.kind} resource does not take --${refused}`);
	if (!supplied.includes(expected)) throw usageError(`${args.kind} resource needs --${expected}`);
	return expected;
};

export const resourceInput = async (ctx: CliContext, args: ResourceArgs, readFile: (path: string) => File = fileAt) => {
	validateSource(args);
	const common = { epic: args.epic, kind: args.kind, name: args.name, ticket: args.ticket };
	switch (args.kind) {
		case "doc":
			return ResourceAddInputSchema.parse({ ...common, body: await readText(ctx, args.body!) });
		case "link":
			return ResourceAddInputSchema.parse({ ...common, url: args.url });
		case "image":
		case "file":
			return ResourceAddInputSchema.parse({ ...common, file: readFile(args.file!) });
	}
};

const add = defineCommand({
	meta: { name: "add", description: "Add a resource to an epic" },
	args: {
		epic: { type: "positional", required: true, description: "Epic ref" },
		kind: { type: "enum", options: [...resourceKinds], required: true, description: "Resource kind" },
		name: { type: "string", required: true, description: "Resource name" },
		ticket: { type: "string", description: "Ticket ref that uses the resource" },
		body: { type: "string", description: "Document body, or - for standard input" },
		url: { type: "string", description: "HTTP or HTTPS link" },
		file: { type: "string", description: "Image or file path" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const resource = await clientOf(ctx).resources.add(await resourceInput(ctx, context.args));
		printRecord(ctx.out, ctx.format, resource, resourceRecord);
	},
});

const list = defineCommand({
	meta: { name: "list", description: "List the resources of an epic" },
	args: { epic: { type: "positional", required: true, description: "Epic ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const resources = await clientOf(ctx).resources.list({ epic: context.args.epic });
		printList(ctx.out, ctx.format, resources, resourceList);
	},
});

const deletedRecord: RecordSpec<{ deleted: string }> = {
	fields: [{ name: "deleted", value: (result) => result.deleted }],
	identifier: (result) => result.deleted,
};

const rm = defineCommand({
	meta: { name: "rm", description: "Remove a resource" },
	args: { id: { type: "positional", required: true, description: "Resource id" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).resources.remove({ id: context.args.id });
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

export default defineCommand({
	meta: { name: "resource", description: "Add, list, or remove the resources of an epic" },
	subCommands: { add, list, rm },
});
