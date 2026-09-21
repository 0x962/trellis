import type { CiState, ListQueryInput, Priority, StatusCategory } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, splitList } from "../context.ts";
import { usageError } from "../errors.ts";
import { labelRefs } from "../flags.ts";
import { printListPages, ticketList } from "../output.ts";

const units: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

// `24h`, `30d`, `15m`, and `2w` become the ISO time that far before now.
// Any other value is an ISO time and passes through.
export const timeBound = (now: Date, value: string | undefined): string | undefined => {
	if (value === undefined) return undefined;
	const match = /^(\d+)([mhdw])$/.exec(value);
	if (match === null) return value;
	return new Date(now.getTime() - Number(match[1]) * units[match[2]!]!).toISOString();
};

const pageMax = 200;

const positiveInteger = /^[1-9][0-9]*$/;

export default defineCommand({
	meta: { name: "list", description: "List tickets by the shared filter grammar" },
	args: {
		project: { type: "string", description: "Project ref" },
		subprojects: { type: "string", valueHint: "true|false", description: "false narrows to that project" },
		status: { type: "string", description: "Status refs, comma-separated" },
		category: { type: "string", description: "Categories, comma-separated" },
		reviewer: { type: "enum", options: ["human", "agent"], description: "Reviewer of a review status" },
		priority: { type: "string", description: "Priorities, comma-separated" },
		parent: { type: "string", description: "Parent ticket ref, or none for top-level only" },
		"waits-on": { type: "string", description: "Ticket ref that each result waits on" },
		blocked: { type: "enum", options: ["true", "false"], description: "Whether an open dependency holds the ticket" },
		epic: { type: "string", description: "Epic ref, or none for tickets outside every epic" },
		wave: { type: "string", description: "Wave ref, or none for tickets outside every wave" },
		label: { type: "string", description: "Label refs, comma-separated; none keeps a ticket with no label" },
		"label-not": { type: "string", description: "Label refs, comma-separated; a ticket that holds one drops out" },
		pr: { type: "enum", options: ["any", "none", "open", "draft", "merged", "closed"], description: "PR state" },
		ci: { type: "string", description: "CI states, comma-separated" },
		actor: { type: "string", description: "Last actor, kind:name or name" },
		q: { type: "string", description: "Full-text query" },
		updated: { type: "string", description: "Updated after: ISO time, or 24h, 30d" },
		created: { type: "string", description: "Created after: ISO time, or 24h, 30d" },
		completed: { type: "string", description: "Completed after: ISO time, or 24h, 30d" },
		sort: {
			type: "string",
			default: "-updatedAt",
			description: "[-]updatedAt|createdAt|priority|number|status|position",
		},
		limit: { type: "string", default: "50", description: "Rows to print; pages follow cursors up to it" },
		all: { type: "boolean", description: "Every row, streamed page by page" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const now = ctx.deps.now();
		if (args.all !== true && !positiveInteger.test(args.limit)) {
			throw usageError(`--limit needs a positive integer, not "${args.limit}"`);
		}
		const want = args.all === true ? Number.POSITIVE_INFINITY : Number(args.limit);
		const query: ListQueryInput = compact({
			project: args.project,
			subprojects: args.subprojects === undefined ? undefined : args.subprojects !== "false",
			status: splitList(args.status),
			category: splitList(args.category) as StatusCategory[] | undefined,
			reviewer: args.reviewer,
			priority: splitList(args.priority) as Priority[] | undefined,
			parent: args.parent,
			waitsOn: args["waits-on"],
			blocked: args.blocked === undefined ? undefined : args.blocked === "true",
			epic: args.epic as ListQueryInput["epic"],
			wave: args.wave as ListQueryInput["wave"],
			label: labelRefs(context.rawArgs, "label"),
			labelNot: labelRefs(context.rawArgs, "label-not"),
			pr: args.pr,
			ci: splitList(args.ci) as CiState[] | undefined,
			actor: args.actor,
			q: args.q,
			updated: timeBound(now, args.updated),
			created: timeBound(now, args.created),
			completed: timeBound(now, args.completed),
			sort: args.sort as ListQueryInput["sort"],
			limit: Math.min(want, pageMax),
		});
		async function* pages() {
			let cursor: string | undefined;
			let taken = 0;
			while (taken < want) {
				const page = await client.tickets.list(compact({ ...query, cursor }));
				const items = page.items.slice(0, want - taken);
				taken += items.length;
				yield items;
				if (page.nextCursor === null || items.length < page.items.length) return;
				cursor = page.nextCursor;
			}
		}
		await printListPages(ctx.out, ctx.format, pages(), ticketList);
	},
});
