import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { installationPaths } from "../installation.ts";

export default defineCommand({
	meta: { name: "serve", description: "Run the server in the foreground" },
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(ctx.deps.env, ctx.deps.home);
		const proc = Bun.spawn([process.execPath, paths.serverEntry], {
			cwd: paths.repoRoot,
			env: ctx.deps.env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		const forward = (signal: NodeJS.Signals) => proc.kill(signal);
		const term = () => forward("SIGTERM");
		const interrupt = () => forward("SIGINT");
		process.once("SIGTERM", term);
		process.once("SIGINT", interrupt);
		const code = await proc.exited;
		process.off("SIGTERM", term);
		process.off("SIGINT", interrupt);
		return code;
	},
});
