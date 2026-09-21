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
			threads: {
				type: "string",
				description: "Local thread identifiers, comma separated, that go to the agent",
			},
		},
		async run(c) {
			const ctx = contextOf(c);
			const a = c.args;
			if (!["comment", "approve", "request_changes"].includes(a.verdict))
				throw usageError("Use comment, approve, or request_changes for --verdict.");
			const api = clientOf(ctx);
			const revision = await api.reviews.revision({ pr: a.pr });
			if (revision === null) throw usageError("Open this pull request in Trellis before you submit a review.");
			ctx.out.write(
				json(
					await api.reviews.submit({
						pr: a.pr,
						headSha: revision.headSha,
						body: await readText(ctx, a.body),
						verdict: a.verdict as "comment" | "approve" | "request_changes",
						threadIds: a.threads === undefined ? [] : a.threads.split(",").filter((value) => value !== ""),
					}),
				),
			);
		},
	}),
};
