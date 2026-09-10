import { existsSync, unlinkSync } from "node:fs";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { installationPaths } from "../installation.ts";

export default defineCommand({
	meta: { name: "uninstall", description: "Remove the launchd agent and command shim" },
	args: {
		prefix: { type: "string", description: "Remove install files under this test root" },
		// citty parses `--no-launchd` as launchd=false, so the flag carries its
		// positive name and defaults to on.
		launchd: {
			type: "boolean",
			default: true,
			description: "Unload the agent with launchctl; --no-launchd removes the files only",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(ctx.deps.env, ctx.deps.home, context.args.prefix);
		// bootout fails when no agent is loaded, and uninstall still removes the files.
		if (context.args.launchd)
			await ctx.deps.run(["launchctl", "bootout", `${ctx.deps.launchdDomain}/com.trellis.server`]);
		if (existsSync(paths.shim)) unlinkSync(paths.shim);
		if (existsSync(paths.plist)) unlinkSync(paths.plist);
		ctx.out.write("removed the trellis command and server agent\n");
	},
});
