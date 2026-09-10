import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { installationPaths } from "../installation.ts";

export default defineCommand({
	meta: { name: "serve", description: "Run the server in the foreground" },
	args: {
		host: {
			type: "string",
			description: "Listen on this address; 0.0.0.0 lets a phone on the network reach the server, which has no auth",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(ctx.deps.env);
		const host = context.args.host;
		const proc = Bun.spawn([process.execPath, paths.serverEntry], {
			cwd: paths.repoRoot,
			env: host === undefined ? ctx.deps.env : { ...ctx.deps.env, TRELLIS_HOST: host },
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
