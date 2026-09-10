import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { repeatedFlag } from "../flags.ts";
import { installationPaths } from "../installation.ts";

export default defineCommand({
	meta: { name: "serve", description: "Run the server in the foreground" },
	args: {
		host: {
			type: "string",
			description: "Listen on this address; 0.0.0.0 lets a phone on the network reach the server, which has no auth",
		},
		"allow-host": {
			type: "string",
			description:
				"Serve requests whose Host header names this hostname, such as a Tailscale Serve name; repeat for more",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(ctx.deps.env, ctx.deps.home);
		const env = { ...ctx.deps.env };
		if (context.args.host !== undefined) env.TRELLIS_HOST = context.args.host;
		const allowedHosts = repeatedFlag(context.rawArgs, "allow-host");
		if (allowedHosts.length > 0) env.TRELLIS_ALLOWED_HOSTS = allowedHosts.join(",");
		const proc = Bun.spawn([process.execPath, paths.serverEntry], {
			cwd: paths.repoRoot,
			env,
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
