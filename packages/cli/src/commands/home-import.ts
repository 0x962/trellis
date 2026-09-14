import { join, resolve } from "node:path";
import { defineCommand } from "citty";
import type { CliContext } from "../context.ts";
import { contextOf } from "../context.ts";
import { installationPaths } from "../installation.ts";

const source = {
	type: "string",
	required: true,
	description: "Stopped source data home; its files stay unchanged",
} as const;
const target = { type: "string", required: true, description: "Separate empty target data home" } as const;
const execute = async (ctx: CliContext, args: string[]) => {
	const paths = installationPaths(ctx.deps.env, ctx.deps.home);
	const child = ctx.deps.spawn(
		[process.execPath, join(paths.repoRoot, "apps/server/src/homeImport/entry.ts"), ...args],
		{ cwd: paths.repoRoot, env: ctx.deps.env },
	);
	const stop = () => child.kill("SIGTERM");
	ctx.deps.signal.addEventListener("abort", stop, { once: true });
	try {
		return await child.exited;
	} finally {
		ctx.deps.signal.removeEventListener("abort", stop);
	}
};
const preview = defineCommand({
	meta: { description: "Preview a stopped home and list copy blockers as JSON" },
	args: { source, target },
	run(context) {
		return execute(contextOf(context), [
			"preview",
			"--source",
			resolve(context.args.source),
			"--target",
			resolve(context.args.target),
		]);
	},
});
const importCommand = defineCommand({
	meta: { description: "Copy an offline home with automation paused. Use the version from preview." },
	args: {
		source,
		target,
		"expected-version": { type: "string", required: true, description: "Source version from preview" },
	},
	run(context) {
		return execute(contextOf(context), [
			"import",
			"--source",
			resolve(context.args.source),
			"--target",
			resolve(context.args.target),
			"--expected-version",
			context.args["expected-version"],
		]);
	},
});
const rollback = defineCommand({
	meta: { description: "Archive an offline imported home and preserve all new work" },
	args: {
		target,
		archive: { type: "string", required: true, description: "Unused sibling path beside the target home" },
	},
	run(context) {
		return execute(contextOf(context), [
			"rollback",
			"--target",
			resolve(context.args.target),
			"--archive",
			resolve(context.args.archive),
		]);
	},
});
export default defineCommand({
	meta: { name: "home-import", description: "Preview, import, or archive an offline Trellis home" },
	subCommands: { preview, import: importCommand, rollback },
});
