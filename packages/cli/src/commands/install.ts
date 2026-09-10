import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { installationPaths } from "../installation.ts";

const bun = "/opt/homebrew/bin/bun";
const routeLine = "  trellis: 4521,";

const xml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const plistText = (paths: ReturnType<typeof installationPaths>) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.trellis.server</string>
	<key>ProgramArguments</key>
	<array>
		<string>${bun}</string>
		<string>${xml(paths.serverEntry)}</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
		<key>HOME</key>
		<string>${xml(paths.userHome)}</string>
		<key>NODE_ENV</key>
		<string>production</string>
		<key>TRELLIS_WEB_DIST</key>
		<string>${xml(paths.webDist)}</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>StandardOutPath</key>
	<string>${xml(paths.log)}</string>
	<key>StandardErrorPath</key>
	<string>${xml(paths.log)}</string>
</dict>
</plist>
`;

const run = async (args: string[], cwd?: string) => {
	const proc = Bun.spawn(args, { cwd, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	return { code, stderr: stderr.trim() };
};

const buildWeb = async (paths: ReturnType<typeof installationPaths>) => {
	if (!existsSync(paths.webDir)) return;
	const result = await run([process.execPath, "run", "build"], paths.webDir);
	if (result.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, result.stderr);
};

const addGateway = (path: string) => {
	const text = readFileSync(path, "utf8");
	if (text.includes(routeLine)) return false;
	const next = text.replace(/(ROUTES[^=]*=\s*{)/, `$1\n${routeLine}`);
	if (next === text) throw new CliFailure("INSTALL_FAILED", 1, `ROUTES object not found in ${path}`);
	writeFileSync(path, next);
	return true;
};

const waitForHealth = async (ctx: ReturnType<typeof contextOf>) => {
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			const response = await ctx.deps.fetch(new Request(`${ctx.url}/api/health`), {});
			if (response.ok) return;
		} catch {}
		await ctx.deps.sleep(200);
	}
	throw new CliFailure("UNREACHABLE", 5, `trellis server not running at ${ctx.url}`);
};

export default defineCommand({
	meta: { name: "install", description: "Install the server as a launchd agent" },
	args: {
		prefix: { type: "string", description: "Write install files under this test root" },
		gateway: { type: "boolean", description: "Add the trellis route to margin" },
		"no-launchd": { type: "boolean", description: "Write files without loading the agent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(context.args.prefix);
		await buildWeb(paths);
		mkdirSync(dirname(paths.shim), { recursive: true });
		writeFileSync(paths.shim, `#!/bin/sh\nexec ${bun} "${paths.cliEntry}" "$@"\n`);
		chmodSync(paths.shim, 0o755);
		mkdirSync(dirname(paths.plist), { recursive: true });
		writeFileSync(paths.plist, plistText(paths));

		if (context.args.gateway === true) {
			const added = addGateway(paths.gateway);
			ctx.out.write(`${added ? "added" : "kept"} ${routeLine.trim()} in ${paths.gateway}\n`);
		} else {
			ctx.out.write(`add to ROUTES in ~/projects/margin/src/gateway.ts:\n${routeLine}\n`);
		}

		if (context.args["no-launchd"] !== true) {
			const uid = process.getuid!();
			const target = `gui/${uid}/com.trellis.server`;
			await run(["launchctl", "bootout", target]);
			const loaded = await run(["launchctl", "bootstrap", `gui/${uid}`, paths.plist]);
			if (loaded.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, loaded.stderr);
			if (context.args.gateway === true) await run(["launchctl", "kickstart", "-k", `gui/${uid}/com.margin.gateway`]);
			await waitForHealth(ctx);
			ctx.out.write(`trellis: ${ctx.url}\n`);
		}
	},
});
