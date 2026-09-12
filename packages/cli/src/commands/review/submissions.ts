import { defineCommand } from "citty";
import { clientOf } from "../../client";
import { contextOf, readText } from "../../context";
import { usageError } from "../../errors";
import { json } from "../../output";

const id = { type: "positional", required: true } as const;
export const submissions = {
	submit: defineCommand({
		args: {
			pr: id,
			verdict: { type: "string", default: "commented" },
			body: { type: "string", default: "" },
			threads: { type: "string" },
			notify: { type: "string", description: "Comma-separated agent run identifiers" },
			"no-notify": { type: "boolean" },
			"request-id": { type: "string" },
			revision: { type: "string" },
		},
		async run(c) {
			const ctx = contextOf(c);
			const a = c.args;
			if (!a.notify && !c.rawArgs.includes("--no-notify")) throw usageError("Pass --notify <run-id> or --no-notify.");
			if (!["commented", "changes_requested", "approved"].includes(a.verdict))
				throw usageError("Use commented, changes_requested, or approved for --verdict.");
			const api = clientOf(ctx);
			const threadIds = a.threads ? a.threads.split(",") : [];
			ctx.out.write(
				json(
					await api.reviews.submit({
						pr: a.pr,
						body: await readText(ctx, a.body),
						requestId: a["request-id"] ?? crypto.randomUUID(),
						verdict: a.verdict as "commented" | "changes_requested" | "approved",
						revisionId: a.revision,
						threadIds,
						recipients: typeof a.notify === "string" ? a.notify.split(",") : [],
					}),
				),
			);
		},
	}),
	show: defineCommand({
		args: { id },
		async run(c) {
			const ctx = contextOf(c);
			ctx.out.write(json(await clientOf(ctx).reviews.show({ id: c.args.id })));
		},
	}),
	inbox: defineCommand({
		args: { run: { type: "string" } },
		async run(c) {
			const ctx = contextOf(c);
			ctx.out.write(json(await clientOf(ctx).reviews.inbox({ runId: c.args.run })));
		},
	}),
	read: defineCommand({
		args: { id, run: { type: "string", required: true } },
		async run(c) {
			const ctx = contextOf(c);
			ctx.out.write(json(await clientOf(ctx).reviews.read({ id: c.args.id, runId: c.args.run })));
		},
	}),
	resend: defineCommand({
		args: { id },
		async run(c) {
			const ctx = contextOf(c);
			ctx.out.write(json(await clientOf(ctx).reviews.resend({ id: c.args.id })));
		},
	}),
};
