import type { PageListInput, PageSummary, PageVersion } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { compact, contextOf } from "../../context.ts";
import { printListPages, printRecord } from "../../output.ts";
import { pageDetailRecord, pageList, versionList } from "./pageText.ts";
import { positiveInteger } from "./revision.ts";

// The largest page one request takes. A larger --limit reads several pages.
const pageMax = 200;

const pageArg = { type: "positional" as const, required: true as const, description: "Page ref" };
const limitArg = {
	type: "string" as const,
	default: "50",
	description: "Rows to print; pages follow cursors up to it",
};
const allArg = { type: "boolean" as const, description: "Every row, streamed page by page" };

// How many rows the caller asked for. `--all` reads every page.
const wanted = (limit: string, all: boolean | undefined): number =>
	all === true ? Number.POSITIVE_INFINITY : positiveInteger(limit, "--limit")!;

// One page of rows after another, until the server reports no next cursor or
// the caller has the rows it asked for.
const keysetPages = async function* <T>(
	want: number,
	read: (cursor: string | undefined, limit: number) => Promise<{ items: T[]; nextCursor: string | null }>,
): AsyncGenerator<T[]> {
	let cursor: string | undefined;
	let taken = 0;
	while (taken < want) {
		const page = await read(cursor, Math.min(want - taken, pageMax));
		taken += page.items.length;
		yield page.items;
		if (page.nextCursor === null) return;
		cursor = page.nextCursor;
	}
};

export const list = defineCommand({
	meta: { name: "list", description: "List the pages of a project" },
	args: {
		project: { type: "string", required: true, description: "Project ref" },
		q: { type: "string", description: "Match the title, the summary, or the page text" },
		author: { type: "string", description: "Actor that published the newest version, as kind:name" },
		watcher: { type: "string", description: "Agent run id that watches the page" },
		comment: { type: "enum", options: ["open", "none"], description: "Pages with or without an open thread" },
		pinned: { type: "boolean", description: "Only the pages this actor pinned" },
		limit: limitArg,
		all: allArg,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const want = wanted(args.limit, args.all);
		const query = compact({
			project: args.project,
			q: args.q,
			author: args.author,
			watcher: args.watcher,
			comment: args.comment as PageListInput["comment"],
			pinned: args.pinned === true ? true : undefined,
		});
		const client = clientOf(ctx);
		await printListPages<PageSummary>(
			ctx.out,
			ctx.format,
			keysetPages(want, (cursor, limit) => client.pages.list(compact({ ...query, cursor, limit }))),
			pageList,
		);
	},
});

export const show = defineCommand({
	meta: { name: "show", description: "Show one page and one of its versions" },
	args: {
		page: pageArg,
		version: { type: "string", description: "Version number; the newest version by default" },
		"include-deleted": { type: "boolean", description: "Read a page that a person deleted" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const page = await clientOf(ctx).pages.get(
			compact({
				page: args.page,
				version: positiveInteger(args.version, "--version"),
				includeDeleted: args["include-deleted"] === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, page, pageDetailRecord);
	},
});

export const versions = defineCommand({
	meta: { name: "versions", description: "List the versions of a page, newest first" },
	args: { page: pageArg, limit: limitArg, all: allArg },
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const want = wanted(args.limit, args.all);
		await printListPages<PageVersion>(
			ctx.out,
			ctx.format,
			keysetPages(want, (cursor, limit) => client.pages.versions(compact({ page: args.page, cursor, limit }))),
			versionList,
		);
	},
});
