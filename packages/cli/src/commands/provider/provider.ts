import { providerKinds } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { printList, printRecord } from "../../output.ts";
import {
	providerCreateInput,
	providerDeletedRecord,
	providerList,
	providerRecord,
	providerUpdateInput,
} from "./providerText.ts";

const idArg = { type: "positional" as const, required: true as const, description: "Provider ID" };
const modelArg = { type: "string" as const, description: "Model ID; repeat for more models" };

const list = defineCommand({
	meta: { name: "list", description: "List external model providers" },
	async run(context) {
		const ctx = contextOf(context);
		printList(ctx.out, ctx.format, await clientOf(ctx).providers.list({}), providerList);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show one external model provider" },
	args: { id: idArg },
	async run(context) {
		const ctx = contextOf(context);
		printRecord(ctx.out, ctx.format, await clientOf(ctx).providers.get({ id: context.args.id }), providerRecord);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create an external model provider" },
	args: {
		name: { type: "string", required: true, description: "Provider name" },
		kind: { type: "enum", options: [...providerKinds], required: true, description: "Provider kind" },
		"base-url": { type: "string", description: "HTTPS endpoint without /v1" },
		"api-key": { type: "string", required: true, description: "Use - to read the key from standard input" },
		model: modelArg,
		disabled: { type: "boolean", description: "Create the provider as disabled" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = await providerCreateInput(ctx, context.rawArgs, context.args);
		printRecord(ctx.out, ctx.format, await clientOf(ctx).providers.create(input), providerRecord);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change the fields of an external model provider" },
	args: {
		id: idArg,
		name: { type: "string", description: "New provider name" },
		"base-url": { type: "string", description: "New HTTPS endpoint without /v1" },
		"api-key": { type: "string", description: "Use - to read the new key from standard input" },
		enabled: { type: "enum", options: ["true", "false"], description: "Whether Trellis can use the provider" },
		model: modelArg,
		"no-models": { type: "boolean", description: "Clear the model list" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = await providerUpdateInput(ctx, context.rawArgs, context.args);
		printRecord(ctx.out, ctx.format, await clientOf(ctx).providers.update(input), providerRecord);
	},
});

const remove = defineCommand({
	meta: { name: "delete", description: "Delete an external model provider" },
	args: { id: idArg },
	async run(context) {
		const ctx = contextOf(context);
		printRecord(
			ctx.out,
			ctx.format,
			await clientOf(ctx).providers.delete({ id: context.args.id }),
			providerDeletedRecord,
		);
	},
});

export default defineCommand({
	meta: { name: "providers", description: "List, create, edit, check, or delete model gateways" },
	subCommands: { list, show, create, edit, delete: remove },
});
