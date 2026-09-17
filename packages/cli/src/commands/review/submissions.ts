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
			verdict: { type: "string", default: "comment" },
			body: { type: "string", default: "" },
		},
		async run(c) {
			const ctx = contextOf(c);
			const a = c.args;
			if (!["comment", "approve", "request_changes"].includes(a.verdict))
				throw usageError("Use comment, approve, or request_changes for --verdict.");
			const api = clientOf(ctx);
			const status = await api.reviews.status({ pr: a.pr });
			ctx.out.write(
				json(
					await api.reviews.submit({
						pr: a.pr,
						headSha: String(status.headRefOid),
						body: await readText(ctx, a.body),
						verdict: a.verdict as "comment" | "approve" | "request_changes",
					}),
				),
			);
		},
	}),
};
