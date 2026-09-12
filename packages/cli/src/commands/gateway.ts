import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineCommand } from "citty";
import { contextOf } from "../context";
import { usageError } from "../errors";
import { installationPaths } from "../installation";
import { gatewayPlist } from "./gateway/plist";
export default defineCommand({
	meta: { name: "gateway", description: "Serve local hostnames and legacy review links" },
	args: {
		port: { type: "string", default: "80" },
		"write-plist": { type: "string", description: "Write a launchd plist to this path, then exit" },
	},
	async run(c) {
		const ctx = contextOf(c);
		const port = Number(c.args.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw usageError("Use a TCP port from 1 to 65535.");
		const paths = installationPaths(ctx.deps.env, ctx.deps.home);
		if (c.args["write-plist"]) {
			const bun = ctx.deps.which("bun");
			if (!bun) throw usageError("Install Bun before you prepare the gateway service.");
			const target = c.args["write-plist"];
			mkdirSync(dirname(target), { recursive: true });
			mkdirSync(paths.dataHome, { recursive: true });
			writeFileSync(
				target,
				gatewayPlist({
					bun,
					entry: join(paths.repoRoot, "apps/server/src/gateway.ts"),
					routes: ctx.deps.env.GATEWAY_ROUTES_FILE ?? paths.routes,
					port,
					log: join(paths.dataHome, "gateway.log"),
				}),
			);
			ctx.out.write(`${target}\n`);
			return;
		}
		const proc = ctx.deps.spawn([process.execPath, `${paths.repoRoot}/apps/server/src/gateway.ts`], {
			cwd: paths.repoRoot,
			env: { ...ctx.deps.env, GATEWAY_PORT: String(port) },
		});
		const stop = () => proc.kill("SIGTERM");
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
		const code = await proc.exited;
		process.off("SIGINT", stop);
		process.off("SIGTERM", stop);
		return code;
	},
});
