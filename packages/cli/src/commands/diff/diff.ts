import { defineCommand } from "citty";
import { alias } from "../../commandTree/alias.ts";
import { records } from "./records.ts";
import { reviewCommand } from "./reviewCommand.ts";
import { stateCommands } from "./state.ts";

export default defineCommand({
	meta: { name: "diff", description: "Manage diffs and local review" },
	subCommands: {
		...records,
		...stateCommands,
		open: reviewCommand("open"),
		comment: defineCommand({
			meta: { name: "comment", description: "Read and answer local review comments" },
			subCommands: {
				list: reviewCommand("list"),
				show: reviewCommand("thread"),
				add: reviewCommand("add"),
				reply: reviewCommand("reply"),
				edit: reviewCommand("edit"),
				resolve: reviewCommand("resolve"),
				reopen: reviewCommand("reopen"),
				react: reviewCommand("react"),
				apply: reviewCommand("apply"),
			},
		}),
		review: defineCommand({
			meta: { name: "review", description: "Submit or export a local review" },
			subCommands: { submit: reviewCommand("submit"), export: reviewCommand("export") },
		}),
		summary: defineCommand({
			meta: { name: "summary", description: "Explain the diff" },
			subCommands: {
				write: alias("summary", ["write"]),
				show: alias("summary", ["show"]),
				export: alias("summary", ["body"]),
			},
		}),
		evidence: alias("evidence"),
	},
});
