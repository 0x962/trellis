import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	foregroundLinuxService,
	installLinuxService,
	startLinuxService,
	statusLinuxService,
	stopLinuxService,
	type LinuxServiceDependencies,
	type LinuxServiceName,
	type LinuxServiceSelection,
	uninstallLinuxService,
} from "../../packages/cli/src/host/linuxService/index.ts";
import { hostServicePreflight } from "./preflight.ts";

if (process.platform !== "linux") throw new Error(`Linux host services require Linux. This host is ${process.platform}.`);

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		release: { type: "string" },
		"data-home": { type: "string" },
		host: { type: "string" },
		port: { type: "string" },
		service: { type: "string" },
		"auth-token-file": { type: "string" },
	},
});

const action = positionals[0];
if (!action || !["install", "status", "start", "stop", "uninstall", "foreground"].includes(action))
	throw new Error("The action must be install, status, start, stop, uninstall, or foreground.");
const selection = (values.service ?? "all") as LinuxServiceSelection;
if (!(["all", "host", "runtime"] as string[]).includes(selection))
	throw new Error("--service must be all, host, or runtime.");
const releaseRoot = () => {
	if (!values.release) throw new Error(`The ${action} action requires --release.`);
	return resolve(values.release);
};
const port = values.port === undefined ? undefined : Number(values.port);
if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535))
	throw new Error("--port must be an integer from 1 through 65535.");

const run = async (args: string[]) => {
	const child = Bun.spawn(args, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code, stdout, stderr };
};

const deps: LinuxServiceDependencies = {
	platform: process.platform,
	arch: process.arch,
	home: homedir(),
	env: process.env,
	randomToken: () => randomBytes(32).toString("hex"),
	preflight: (releaseRoot, context) =>
		hostServicePreflight({
			releaseRoot,
			context,
			preflightScript: resolve(import.meta.dir, "../host-release/preflight.ts"),
			run,
		}),
	run,
};

const input = {
	releaseRoot: values.release ? resolve(values.release) : "",
	dataHome: values["data-home"] ? resolve(values["data-home"]) : undefined,
	host: values.host,
	port,
};

if (action === "install") {
	const installation = await installLinuxService({ ...input, releaseRoot: releaseRoot() }, deps);
	process.stdout.write(`${JSON.stringify(installation, null, 2)}\n`);
} else if (action === "status") {
	process.stdout.write(`${JSON.stringify(await statusLinuxService(deps), null, 2)}\n`);
} else if (action === "start") {
	await startLinuxService(selection, deps);
} else if (action === "stop") {
	await stopLinuxService(selection, deps);
} else if (action === "uninstall") {
	await uninstallLinuxService(deps);
} else {
	if (selection === "all") throw new Error("The foreground action requires --service host or --service runtime.");
	if (selection === "host" && !values["auth-token-file"])
		throw new Error("The foreground host requires --auth-token-file.");
	const authToken =
		selection === "host"
			? (await readFile(resolve(values["auth-token-file"]!), "utf8")).trim()
			: undefined;
	const command = await foregroundLinuxService(
		{ ...input, releaseRoot: releaseRoot(), service: selection as LinuxServiceName, authToken },
		deps,
	);
	process.umask(0o077);
	process.execve!(command.executable, [command.executable, ...command.args], command.env);
}
