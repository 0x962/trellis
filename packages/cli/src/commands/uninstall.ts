import { existsSync, unlinkSync } from "node:fs";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { installationPaths } from "../installation.ts";

export default defineCommand({
	meta: { name: "uninstall", description: "Remove the launchd agent and command shim" },
	args: {
		prefix: { type: "string", description: "Remove install files under this test root" },
		"no-launchd": { type: "boolean", description: "Remove files without unloading the agent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(context.args.prefix);
		if (context.args["no-launchd"] !== true) {
			const proc = Bun.spawn(["launchctl", "bootout", `gui/${process.getuid!()}/com.trellis.server`], {
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
		}
		if (existsSync(paths.shim)) unlinkSync(paths.shim);
		if (existsSync(paths.plist)) unlinkSync(paths.plist);
		ctx.out.write("removed the trellis command and server agent\n");
	},
});
