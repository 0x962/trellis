import type { ReactionKeySchema, ReviewThread } from "@trellis/api";
import { reviewHref } from "@trellis/api/client";
import { defineCommand } from "citty";
import type { z } from "zod";
import { clientOf, clientOptions, createClient } from "../../client";
import { type CliContext, contextOf, readText } from "../../context";
import { usageError } from "../../errors";
import { emitReview as emit } from "./output";
import { submissions } from "./submissions";
import { transfer } from "./transfers";

const ref = { type: "positional", required: true, description: "GitHub PR URL or owner/repo#123" } as const;
const id = { type: "positional", required: true, description: "Review thread or message identifier" } as const;
const body = { type: "string", required: true, description: "Markdown, or - for stdin" } as const;
const identity = {
	author: { type: "string", description: "Author name" },
	session: { type: "string", description: "Agent session identifier" },
} as const;
// reviewHref throws a plain Error for a reference it cannot read, because
// the web catches it and shows the sentence. The CLI has no catch around a
// verb, so it turns the same sentence into the one-line usage failure.
const hrefOf = (pr: string) => {
	try {
		return reviewHref(pr);
	} catch (error) {
		throw usageError((error as Error).message);
	}
};

const client = (ctx: CliContext, args: { author?: string; session?: string }) =>
	createClient({
		...clientOptions(ctx),
		...(args.author ? { actor: `${ctx.actor().kind}:${args.author}` } : {}),
		session: args.session ?? ctx.deps.env.TRELLIS_SESSION ?? ctx.actor().session ?? undefined,
	});

export default defineCommand({
	meta: { name: "review", description: "Review PRs and discuss local findings" },
	subCommands: {
		open: defineCommand({
			args: { pr: ref, browser: { type: "boolean", description: "Open the browser" } },
			async run(c) {
				const ctx = contextOf(c);
				await clientOf(ctx).reviews.open({ pr: c.args.pr });
				const url = `${ctx.publicUrl}${hrefOf(c.args.pr)}`;
				ctx.out.write(`${url}\n`);
				if (c.args.browser) ctx.deps.open(url);
			},
		}),
		prs: defineCommand({
			args: { project: { type: "string", description: "The pull requests of one project: KEY or KEY.slug" } },
			async run(c) {
				const ctx = contextOf(c);
				emit(ctx, await clientOf(ctx).reviews.prs(c.args.project === undefined ? {} : { project: c.args.project }));
			},
		}),
		list: defineCommand({
			args: { pr: ref, all: { type: "boolean", description: "Include resolved threads" } },
			async run(c) {
				const ctx = contextOf(c);
				const api = clientOf(ctx);
				const items: ReviewThread[] = [];
				for (let offset = 0; ; offset += 500) {
					const page = await api.reviews.list({ pr: c.args.pr, all: c.args.all ?? false, offset, limit: 500 });
					items.push(...page.items);
					if (page.items.length < 500) break;
				}
				emit(ctx, items);
			},
		}),
		thread: defineCommand({
			args: { id },
			async run(c) {
				const ctx = contextOf(c);
				emit(ctx, await clientOf(ctx).reviews.thread({ id: c.args.id }));
			},
		}),
		add: defineCommand({
			args: {
				pr: ref,
				path: { type: "string", required: true },
				line: { type: "string", required: true },
				"start-line": { type: "string" },
				side: { type: "string", default: "new" },
				revision: { type: "string" },
				body,
				...identity,
			},
			async run(c) {
				const ctx = contextOf(c);
				const a = c.args;
				if (a.side !== "old" && a.side !== "new") throw usageError("--side must be old or new");
				emit(
					ctx,
					await client(ctx, a).reviews.add({
						pr: a.pr,
						path: a.path,
						line: Number(a.line),
						startLine: a["start-line"] === undefined ? undefined : Number(a["start-line"]),
						side: a.side,
						revisionId: a.revision,
						body: await readText(ctx, a.body),
					}),
				);
			},
		}),
		reply: defineCommand({
			args: { id, body, ...identity },
			async run(c) {
				const ctx = contextOf(c);
				emit(ctx, await client(ctx, c.args).reviews.reply({ id: c.args.id, body: await readText(ctx, c.args.body) }));
			},
		}),
		edit: defineCommand({
			args: { id, body, thread: { type: "string", description: "Root thread identifier for a reply" } },
			async run(c) {
				const ctx = contextOf(c);
				const api = clientOf(ctx);
				const t = await api.reviews.thread({ id: c.args.thread ?? c.args.id });
				const message = !c.args.thread || t.id === c.args.id ? t : t.replies.find((r) => r.id === c.args.id);
				if (!message) throw usageError("The thread does not contain that message.");
				emit(
					ctx,
					await api.reviews.edit({
						id: message.id,
						expectedVersion: message.version,
						body: await readText(ctx, c.args.body),
					}),
				);
			},
		}),
		resolve: defineCommand({
			args: { id, ...identity },
			async run(c) {
				const ctx = contextOf(c);
				emit(ctx, await client(ctx, c.args).reviews.resolve({ id: c.args.id, resolved: true }));
			},
		}),
		reopen: defineCommand({
			args: { id },
			async run(c) {
				const ctx = contextOf(c);
				emit(ctx, await clientOf(ctx).reviews.resolve({ id: c.args.id, resolved: false }));
			},
		}),
		react: defineCommand({
			args: { id, reaction: { type: "positional", required: true }, remove: { type: "boolean" } },
			async run(c) {
				const ctx = contextOf(c);
				emit(
					ctx,
					await clientOf(ctx).reviews.reaction({
						id: c.args.id,
						reaction: c.args.reaction as z.infer<typeof ReactionKeySchema>,
						remove: c.args.remove ?? false,
					}),
				);
			},
		}),
		...submissions,
		export: transfer,
	},
});
