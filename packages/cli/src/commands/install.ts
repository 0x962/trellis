import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Health } from "@trellis/api";
import { defineCommand } from "citty";
import { type CliContext, contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { repeatedFlag } from "../flags.ts";
import { setRoute } from "../gatewayRoutes.ts";
import { installationPaths, supersetBin } from "../installation.ts";
import { plistText, readPlist, serverPort } from "../servicePlist.ts";

type Paths = ReturnType<typeof installationPaths>;

const LABEL = "com.trellis.server";

const buildWeb = async (ctx: CliContext, paths: Paths) => {
	if (!existsSync(paths.webDir)) return;
	const result = await ctx.deps.run([process.execPath, "run", "build"], paths.webDir);
	if (result.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, result.stderr);
};

// The commit at HEAD of this checkout, or null when git finds no work tree.
const commitOf = async (ctx: CliContext, dir: string) => {
	const head = await ctx.deps.run(["git", "rev-parse", "HEAD"], dir);
	return head.code === 0 ? head.stdout.trim() : null;
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

// The health answer of the server at ctx.url. `status` is null when no
// server answers. `checkout` is the checkout that a 2xx answer names. It is
// null for an answer that is not 2xx, and for an answer with no `source`,
// which a server of an earlier release sends.
type HealthAnswer = { status: number | null; ok: boolean; checkout: string | null };

const readHealth = async (ctx: CliContext): Promise<HealthAnswer> => {
	let response: Response;
	try {
		response = await ctx.deps.fetch(new Request(`${ctx.url}/api/health`), {});
	} catch {
		return { status: null, ok: false, checkout: null };
	}
	if (!response.ok) return { status: response.status, ok: false, checkout: null };
	const health = (await response.json().catch(() => ({}))) as Partial<Health>;
	return { status: response.status, ok: true, checkout: health.source?.checkout ?? null };
};

// A desktop release on the port answers health with HTTP 401, so the text
// keeps the status of an answer that names no checkout.
const describeAnswer = ({ status, checkout }: HealthAnswer) => {
	if (status === null) return "no server answers";
	if (checkout !== null) return `the server that answers runs ${checkout}`;
	return `a server answers with HTTP ${status} and names no checkout`;
};

// A boot of the launchd server on a data home in daily use takes about 30 s,
// and the migrations run inside that time. The wait is twice as long.
const HEALTH_POLL_MS = 200;
const HEALTH_WAIT_MS = 60_000;

// Another process can hold the port of the server, and its answer does not
// prove that the server install started runs. `accept` decides whether the
// checkout in an answer belongs to that server.
const waitForHealth = async (ctx: CliContext, accept: (checkout: string | null) => boolean, advice = "") => {
	let answer: HealthAnswer = { status: null, ok: false, checkout: null };
	for (let waited = 0; waited < HEALTH_WAIT_MS; waited += HEALTH_POLL_MS) {
		answer = await readHealth(ctx);
		if (answer.ok && accept(answer.checkout)) return;
		await ctx.deps.sleep(HEALTH_POLL_MS);
	}
	throw new CliFailure(
		"UNREACHABLE",
		5,
		`the trellis server did not answer at ${ctx.url} in 60 s: ${describeAnswer(answer)}${advice}`,
	);
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

// Stops the com.trellis.server job and loads the job that the plist file
// describes. When this function throws, launchd holds no server, and the
// server of that plist did not start.
const loadService = async (ctx: CliContext, plist: string) => {
	const domain = ctx.deps.launchdDomain;
	const service = `${domain}/${LABEL}`;
	await ctx.deps.run(["launchctl", "bootout", service]);
	await waitForUnload(ctx, service);
	const loaded = await ctx.deps.run(["launchctl", "bootstrap", domain, plist]);
	if (loaded.code !== 0) throw new CliFailure("INSTALL_FAILED", 1, loaded.stderr);
};

// The plist and the shim on disk before install writes its own. null means
// that no file was there.
type Replaced = { plist: string | null; shim: string | null };

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Only a failure of `loadService` calls this function. The new server did
// not start, so it applied no migration, and the old server finds the
// database schema that it left. install writes back the plist and the shim it
// replaced and starts that service again, so the machine keeps the server it
// had. The failure still ends the install.
//
// A server of an earlier release names no checkout in its health answer, so
// an answer with no checkout also counts as the old server.
const restore = async (ctx: CliContext, paths: Paths, replaced: Replaced, failure: CliFailure) => {
	if (replaced.plist === null) throw failure;
	writeFileSync(paths.plist, replaced.plist);
	if (replaced.shim !== null) writeFileSync(paths.shim, replaced.shim);
	const previous = readPlist(replaced.plist).checkout;
	const outcome = await loadService(ctx, paths.plist)
		.then(() => waitForHealth(ctx, (checkout) => checkout === null || checkout === previous))
		.then(
			() => "install restored the previous service",
			(error: Error) => `install could not restore the previous service: ${error.message}`,
		);
	throw new CliFailure(failure.code, failure.exitCode, `${failure.message}; ${outcome}`);
};

// `launchctl print` lists `pid = <n>` for a job that runs.
const PID = /^\s*pid = (\d+)$/m;

// A shell word stays bare when it holds only these characters.
const BARE = /^[\w@%+=:,./-]+$/;
const shellWord = (word: string) => (BARE.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`);

// An install replaces the server that launchd runs, and every agent that
// talks to that server loses it until the new one answers. A plist that runs
// the server of another checkout belongs to another install, so install
// stops before it changes a file.
const refuseTakeover = async (ctx: CliContext, paths: Paths, plist: string, rawArgs: string[]) => {
	const found = readPlist(plist);
	if (found.checkout === paths.repoRoot) return;
	const printed = await ctx.deps.run(["launchctl", "print", `${ctx.deps.launchdDomain}/${LABEL}`]);
	const pid = printed.code === 0 ? PID.exec(printed.stdout)?.[1] : undefined;
	const answer = await readHealth(ctx);
	ctx.err.write(
		[
			`${LABEL} runs the server of another checkout`,
			`  plist:          ${paths.plist}`,
			`  checkout:       ${found.checkout}`,
			`  commit:         ${found.commit ?? "not recorded"}`,
			`  launchd job:    ${pid === undefined ? "not running" : `pid ${pid}, port ${found.port}`}`,
			`  ${ctx.url}: ${describeAnswer(answer)}`,
			`  this checkout:  ${paths.repoRoot}`,
			"To replace that service with the server of this checkout, run:",
			`  ${["trellis", "install", ...rawArgs, "--force"].map(shellWord).join(" ")}`,
			"",
		].join("\n"),
	);
	throw new CliFailure("INSTALL_REFUSED", 1, "install changed no file");
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
		"superset-bin": {
			type: "string",
			description: "Run agents with this superset binary; the default is the superset on PATH",
		},
		force: {
			type: "boolean",
			default: false,
			description: "Replace a service that runs the server of another checkout",
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
		const replaced: Replaced = { plist: readIfExists(paths.plist), shim: readIfExists(paths.shim) };
		if (replaced.plist !== null && !context.args.force)
			await refuseTakeover(ctx, paths, replaced.plist, context.rawArgs);
		const superset = supersetBin(ctx.deps, context.args["superset-bin"]);
		if (superset === null) {
			ctx.err.write(
				"superset is not on PATH: agents need the Superset CLI; install it or pass --superset-bin <path>, then run trellis install again\n",
			);
		}
		await buildWeb(ctx, paths);
		const commit = await commitOf(ctx, paths.repoRoot);
		mkdirSync(dirname(paths.shim), { recursive: true });
		// The shim and the plist run the same bun, so a machine that serves
		// trellis also runs every `trellis` command.
		writeFileSync(paths.shim, `#!/bin/sh\nexec "${bun}" "${paths.cliEntry}" "$@"\n`);
		chmodSync(paths.shim, 0o755);
		mkdirSync(dirname(paths.plist), { recursive: true });
		const allowedHosts = repeatedFlag(context.rawArgs, "allow-host");
		writeFileSync(paths.plist, plistText(paths, { host: context.args.host, allowedHosts, bun, superset, commit }));

		setRoute(paths.routes, "trellis", serverPort);

		if (context.args.launchd) {
			try {
				await loadService(ctx, paths.plist);
			} catch (failure) {
				if (!(failure instanceof CliFailure)) throw failure;
				await restore(ctx, paths, replaced, failure);
			}
			// The new server can be in the middle of its migrations when the
			// wait ends. launchd keeps the job and starts it again when it exits,
			// so install leaves it to finish its boot and runs no restore.
			await waitForHealth(
				ctx,
				(checkout) => checkout === paths.repoRoot,
				`. launchd keeps the new job and starts it again when it exits. Read ${paths.log}, then run trellis status.`,
			);
			if (await gatewayServes(ctx)) {
				ctx.out.write("trellis: http://trellis.localhost\n");
			} else {
				ctx.out.write(`trellis: http://127.0.0.1:${serverPort}\n`);
				ctx.out.write(`a gateway on port 80 serves http://trellis.localhost when it reads ${paths.routes}\n`);
			}
		}
	},
});
