import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { compact, contextOf, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { printRecord } from "../../output.ts";
import { pageRecord, pinRecord } from "./pageText.ts";
import { positiveInteger } from "./revision.ts";

const pageArg = { type: "positional" as const, required: true as const, description: "Page ref" };
const expectedVersionArg = {
	type: "string" as const,
	required: true as const,
	description: "Page revision the caller last read",
};
const forceArg = { type: "boolean" as const, description: "Let an agent change the deleted state of the page" };

// The title of a page changes; its slug does not, so every saved link to the
// page still opens it.
export const rename = defineCommand({
	meta: { name: "rename", description: "Change the title of a page and keep its address" },
	args: {
		page: pageArg,
		title: { type: "positional", required: true, description: "New title, or - for standard input" },
		summary: { type: "string", description: "New summary, or - for standard input" },
		"expected-version": expectedVersionArg,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const page = await clientOf(ctx).pages.update(
			compact({
				page: args.page,
				title: await readText(ctx, args.title),
				summary: args.summary === undefined ? undefined : await readText(ctx, args.summary),
				expectedVersion: positiveInteger(args["expected-version"], "--expected-version")!,
			}),
		);
		printRecord(ctx.out, ctx.format, page, pageRecord);
	},
});

// A pin belongs to the actor that sets it. It adds no version and changes
// nothing that another actor reads.
const pinCommand = (pinned: boolean) =>
	defineCommand({
		meta: {
			name: pinned ? "pin" : "unpin",
			description: pinned ? "Pin a page for this actor" : "Remove this actor's pin from a page",
		},
		args: { page: pageArg },
		async run(context) {
			const ctx = contextOf(context);
			const result = await clientOf(ctx).pages.pin({ page: context.args.page, pinned });
			printRecord(ctx.out, ctx.format, result, pinRecord);
		},
	});

export const pin = pinCommand(true);
export const unpin = pinCommand(false);

export const rm = defineCommand({
	meta: { name: "rm", description: "Delete a page and keep it for 30 days" },
	args: {
		page: pageArg,
		"expected-version": expectedVersionArg,
		yes: { type: "boolean", description: "Confirm the delete" },
		force: forceArg,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.yes !== true) throw usageError("rm needs --yes; a deleted page leaves every list and search for 30 days");
		const page = await clientOf(ctx).pages.delete(
			compact({
				page: args.page,
				expectedVersion: positiveInteger(args["expected-version"], "--expected-version")!,
				force: args.force === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, page, pageRecord);
	},
});

export const restore = defineCommand({
	meta: { name: "restore", description: "Restore a deleted page during its 30 days" },
	args: { page: pageArg, "expected-version": expectedVersionArg, force: forceArg },
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const page = await clientOf(ctx).pages.restore(
			compact({
				page: args.page,
				expectedVersion: positiveInteger(args["expected-version"], "--expected-version")!,
				force: args.force === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, page, pageRecord);
	},
});
