import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { type CliContext, contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { repeatedFlag } from "../flags.ts";
import { setRoute } from "../gatewayRoutes.ts";
import { installationPaths } from "../installation.ts";

// The plist sets no TRELLIS_PORT, so the launchd server listens on 4521.
const serverPort = 4521;

type Paths = ReturnType<typeof installationPaths>;

const xml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// The server binds 127.0.0.1 when the plist sets no TRELLIS_HOST.
const hostEntry = (host: string | undefined) =>
	host === undefined ? "" : `\t\t<key>TRELLIS_HOST</key>\n\t\t<string>${xml(host)}</string>\n`;

// The server refuses a Host header that names a hostname it does not know.
// Each --allow-host name, such as a Tailscale Serve hostname, passes that
// check.
const allowedHostsEntry = (names: string[]) =>
	names.length === 0 ? "" : `\t\t<key>TRELLIS_ALLOWED_HOSTS</key>\n\t\t<string>${xml(names.join(","))}</string>\n`;

// `bun` is the path that `which` finds on PATH, with no symlink resolved. A
// Homebrew bun on PATH is a symlink that `brew upgrade` moves to the new
// version. `process.execPath` names the versioned Cellar directory, which
// the upgrade deletes, and the agent then has no program to run.
const plistText = (
	paths: Paths,
	host: string | undefined,
	allowedHosts: string[],
	bun: string,
) => `<?xml version="1.0" encoding="UTF-8"?>
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
${hostEntry(host)}${allowedHostsEntry(allowedHosts)}	</dict>
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

// A gateway on port 80 that reads the routes file sends trellis.localhost to
// the server. A gateway without that route answers with an error status, so
// only a 2xx answer proves the route. The fetch fails when nothing listens on
// port 80.
const gatewayServes = async (ctx: CliContext) => {
	const probe = new Request("http://127.0.0.1:80/api/health", { headers: { host: "trellis.localhost" } });
	try {
		return (await ctx.deps.fetch(probe, {})).ok;
	} catch {
		return false;
	}
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

// launchctl bootout returns before launchd removes the job. A bootstrap of
// the label while launchd still holds the job fails with "Bootstrap failed:
// 5" and leaves the server stopped. launchctl print exits with a code that is
// not 0 when launchd holds no job with the label.
const UNLOAD_POLL_MS = 200;
const UNLOAD_WAIT_MS = 5000;

const waitForUnload = async (ctx: CliContext, service: string) => {
	for (let waited = 0; waited < UNLOAD_WAIT_MS; waited += UNLOAD_POLL_MS) {
		const found = await ctx.deps.run(["launchctl", "print", service]);
		if (found.code !== 0) return;
		await ctx.deps.sleep(UNLOAD_POLL_MS);
	}
	throw new CliFailure(
		"INSTALL_FAILED",
		1,
		`launchd did not remove ${service} in 5 s. Run launchctl bootout ${service}, then run trellis install again.`,
	);
};

export default defineCommand({
	meta: { name: "install", description: "Install the server as a launchd agent" },
	args: {
		prefix: { type: "string", description: "Write install files under this test root" },
		host: {
			type: "string",
			description: "Listen on this address; 0.0.0.0 lets a phone on the network reach the server, which has no auth",
		},
		"allow-host": {
			type: "string",
			description:
				"Serve requests whose Host header names this hostname, such as a Tailscale Serve name; repeat for more",
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
		// The shim and the plist run the same bun, so a machine that serves
		// trellis also runs every `trellis` command.
		writeFileSync(paths.shim, `#!/bin/sh\nexec "${bun}" "${paths.cliEntry}" "$@"\n`);
		chmodSync(paths.shim, 0o755);
		mkdirSync(dirname(paths.plist), { recursive: true });
		const allowedHosts = repeatedFlag(context.rawArgs, "allow-host");
		writeFileSync(paths.plist, plistText(paths, context.args.host, allowedHosts, bun));

		setRoute(paths.routes, "trellis", serverPort);

		if (context.args.launchd) {
			const domain = ctx.deps.launchdDomain;
			const service = `${domain}/com.trellis.server`;
			await ctx.deps.run(["launchctl", "bootout", service]);
			await waitForUnload(ctx, service);
			const loaded = await ctx.deps.run(["launchctl", "bootstrap", domain, paths.plist]);
			if (loaded.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, loaded.stderr);
			await waitForHealth(ctx);
			if (await gatewayServes(ctx)) {
				ctx.out.write("trellis: http://trellis.localhost\n");
			} else {
				ctx.out.write(`trellis: http://127.0.0.1:${serverPort}\n`);
				ctx.out.write(`a gateway on port 80 serves http://trellis.localhost when it reads ${paths.routes}\n`);
			}
		}
	},
});
