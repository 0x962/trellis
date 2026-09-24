import type { ArgsDef, CommandDef } from "citty";
import { clientOf } from "../../client.ts";
import { alias } from "../../commandTree/alias.ts";
import { contextOf } from "../../context.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";

export const reviewCommand = (name: string) => async (): Promise<CommandDef> => {
	const command = await alias("review", [name])();
	const args = command.args as ArgsDef;
	if (args.pr === undefined) return command;
	const { pr, ...rest } = args;
	return {
		...command,
		args: { diff: { ...pr, description: "Diff ID, URL, or owner/repo#number" }, ...rest },
		async run(context) {
			const original = String(context.args.diff);
			const ref = await resolvePullRequest(clientOf(contextOf(context)), original, true);
			return command.run!({
				...context,
				args: {
					...context.args,
					pr: ref.url,
					_: context.args._.map((value) => (value === original ? ref.url : value)),
				} as unknown as typeof context.args,
			});
		},
	};
};
