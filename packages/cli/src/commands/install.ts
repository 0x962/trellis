import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { type CliContext, contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { installationPaths } from "../installation.ts";

const shimBun = "/opt/homebrew/bin/bun";
const routeLine = "  trellis: 4521,";

type Paths = ReturnType<typeof installationPaths>;

const xml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// The server binds 127.0.0.1 when the plist sets no TRELLIS_HOST.
const hostEntry = (host: string | undefined) =>
	host === undefined ? "" : `\t\t<key>TRELLIS_HOST</key>\n\t\t<string>${xml(host)}</string>\n`;

// `bun` is the path that `which` finds on PATH, with no symlink resolved. A
// Homebrew bun on PATH is a symlink that `brew upgrade` moves to the new
// version. `process.execPath` names the versioned Cellar directory, which
// the upgrade deletes, and the agent then has no program to run.
const plistText = (paths: Paths, host: string | undefined, bun: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.trellis.server</string>
	<key>ProgramArguments</key>
	<array>
		<string>${xml(bun)}</string>
		<string>${xml(paths.serverEntry)}</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${xml(dirname(bun))}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
		<key>HOME</key>
		<string>${xml(paths.userHome)}</string>
		<key>TRELLIS_HOME</key>
		<string>${xml(paths.dataHome)}</string>
		<key>NODE_ENV</key>
		<string>production</string>
		<key>TRELLIS_WEB_DIST</key>
		<string>${xml(paths.webDist)}</string>
${hostEntry(host)}	</dict>
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

const buildWeb = async (ctx: CliContext, paths: Paths) => {
	if (!existsSync(paths.webDir)) return;
	const result = await ctx.deps.run([process.execPath, "run", "build"], paths.webDir);
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

const waitForHealth = async (ctx: CliContext) => {
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
		host: {
			type: "string",
			description: "Listen on this address; 0.0.0.0 lets a phone on the network reach the server, which has no auth",
		},
		// citty parses `--no-launchd` as launchd=false, so the flag carries its
		// positive name and defaults to on.
		launchd: {
			type: "boolean",
			default: true,
			description: "Load the agent with launchctl; --no-launchd writes the files only",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const paths = installationPaths(ctx.deps.env, ctx.deps.home, context.args.prefix);
		const bun = ctx.deps.which("bun");
		if (bun === null) throw new CliFailure("INSTALL_FAILED", 1, "bun is not on PATH");
		await buildWeb(ctx, paths);
		mkdirSync(dirname(paths.shim), { recursive: true });
		writeFileSync(paths.shim, `#!/bin/sh\nexec ${shimBun} "${paths.cliEntry}" "$@"\n`);
		chmodSync(paths.shim, 0o755);
		mkdirSync(dirname(paths.plist), { recursive: true });
		writeFileSync(paths.plist, plistText(paths, context.args.host, bun));

		if (context.args.gateway === true) {
			const added = addGateway(paths.gateway);
			ctx.out.write(`${added ? "added" : "kept"} ${routeLine.trim()} in ${paths.gateway}\n`);
		} else {
			ctx.out.write(`add to ROUTES in ~/projects/margin/src/gateway.ts:\n${routeLine}\n`);
		}

		if (context.args.launchd) {
			const domain = ctx.deps.launchdDomain;
			await ctx.deps.run(["launchctl", "bootout", `${domain}/com.trellis.server`]);
			const loaded = await ctx.deps.run(["launchctl", "bootstrap", domain, paths.plist]);
			if (loaded.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, loaded.stderr);
			if (context.args.gateway === true) {
				await ctx.deps.run(["launchctl", "kickstart", "-k", `${domain}/com.margin.gateway`]);
			}
			await waitForHealth(ctx);
			ctx.out.write(`trellis: ${ctx.url}\n`);
		}
	},
});
