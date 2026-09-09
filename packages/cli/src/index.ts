#!/usr/bin/env bun
import { userInfo } from "node:os";
import { ORPCError } from "@orpc/client";
import { type ArgsDef, type CommandDef, defineCommand, renderUsage, runCommand } from "citty";
import apiPkg from "../../api/package.json" with { type: "json" };
import cliPkg from "../package.json" with { type: "json" };
import { type ActorResolution, actorHint, resolveActor } from "./actor.ts";
import type { CliContext } from "./context.ts";
import { CliFailure, exitCodeFor, formatError, formatFailure } from "./errors.ts";
import { type Format, type Mode, stripAnsi } from "./output.ts";

export type Stream = { write(text: string): void; isTTY: boolean };

// Every effect of a run goes through here, so a test injects the server,
// the streams, the environment, the clock, and the git and OS lookups.
export type Deps = {
	fetch: (request: Request, init: { redirect?: Request["redirect"] }) => Promise<Response>;
	env: Record<string, string | undefined>;
	stdout: Stream;
	stderr: Stream;
	stdin: () => Promise<string>;
	gitUserName: () => string;
	osUser: () => string;
	now: () => Date;
	sleep: (ms: number) => Promise<void>;
	open: (url: string) => void;
	signal: AbortSignal;
	apiVersion: string;
};

export const defaultUrl = "http://127.0.0.1:4521";

const globalArgs = {
	json: { type: "boolean", description: "Print the procedure output as JSON" },
	jsonl: { type: "boolean", description: "Print one JSON object per line" },
	quiet: { type: "boolean", description: "Print one identifier per line" },
	as: { type: "string", valueHint: "kind:name|name", description: "Act as this actor" },
	url: { type: "string", valueHint: "url", description: `Server URL (TRELLIS_URL, default ${defaultUrl})` },
	"no-color": { type: "boolean", description: "Print no ANSI escape sequences" },
} satisfies ArgsDef;

type Loader = () => Promise<CommandDef>;

// One row per verb of the CLI table. `load` imports the verb's module on
// dispatch, so `--help` and a stub load no command module.
const verbs: Record<string, { description: string; load: Loader }> = {
	projects: { description: "List, create, show, move, or set repos on projects", load: () => loadCommand("projects") },
	statuses: { description: "List, add, edit, remove, or clear statuses", load: () => loadCommand("statuses") },
	create: { description: "Create a ticket", load: () => loadCommand("create") },
	show: { description: "Show one ticket", load: () => loadCommand("show") },
	list: { description: "List tickets by the shared filter grammar", load: () => loadCommand("list") },
	edit: { description: "Change ticket fields", load: () => loadCommand("edit") },
	move: { description: "Move a ticket to a status", load: () => loadCommand("move") },
	comment: { description: "Add a comment", load: () => loadCommand("comment") },
	comments: { description: "List the comments of a ticket", load: () => loadCommand("comment", "comments") },
	attach: { description: "Upload a file to a ticket", load: () => loadCommand("attach") },
	attachments: { description: "List the attachments of a ticket", load: () => loadCommand("attach", "attachments") },
	pr: { description: "Link, list, remove, refresh, or diff pull requests", load: () => loadCommand("pr") },
	sub: { description: "Create a sub-ticket", load: () => loadCommand("sub") },
	delete: { description: "Delete a ticket", load: () => loadCommand("delete") },
	search: { description: "Search tickets and projects", load: () => loadCommand("search") },
	activity: { description: "List the activity of a ticket", load: () => loadCommand("activity") },
	brief: { description: "Print the markdown brief of a ticket", load: () => loadCommand("brief") },
	inbox: { description: "Show what needs a human", load: () => loadCommand("inbox") },
	watch: { description: "Print events as JSON lines", load: () => loadCommand("watch") },
	open: { description: "Print or open the web URL of a ticket", load: () => loadCommand("open") },
	whoami: { description: "Explain the actor resolution", load: () => loadCommand("whoami") },
	instructions: { description: "Print the AGENTS.md block", load: () => loadCommand("instructions") },
	status: { description: "Show server health", load: () => loadCommand("status") },
	logs: { description: "Tail the server log", load: () => loadCommand("logs") },
	serve: { description: "Run the server in the foreground", load: () => loadCommand("serve") },
	install: { description: "Install the server as a launchd agent", load: () => loadCommand("install") },
	uninstall: { description: "Remove the launchd agent", load: () => loadCommand("uninstall") },
	backup: { description: "Write a backup archive", load: () => loadCommand("backup") },
	restore: { description: "Restore a backup archive", load: () => loadCommand("restore") },
	export: { description: "Stream every table as NDJSON", load: () => loadCommand("export") },
};

const loadCommand = async (file: string, name = "default"): Promise<CommandDef> =>
	(await import(`./commands/${file}.ts`))[name] as CommandDef;

const description = "A local ticket tracker for agent-driven work";

export const main = defineCommand({
	meta: { name: "trellis", version: cliPkg.version, description },
	args: globalArgs,
	subCommands: Object.fromEntries(Object.entries(verbs).map(([name, verb]) => [name, verb.load])),
});

type Globals = {
	json: boolean;
	jsonl: boolean;
	quiet: boolean;
	noColor: boolean;
	help: boolean;
	as?: string;
	url?: string;
	rest: string[];
};

// Global flags parse before dispatch and in any position.
export const splitGlobals = (argv: string[]): Globals => {
	const globals: Globals = { json: false, jsonl: false, quiet: false, noColor: false, help: false, rest: [] };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		const equals = arg.indexOf("=");
		const name = equals === -1 ? arg : arg.slice(0, equals);
		const value = () => (equals === -1 ? argv[++index] : arg.slice(equals + 1));
		if (name === "--json") globals.json = true;
		else if (name === "--jsonl") globals.jsonl = true;
		else if (name === "--quiet") globals.quiet = true;
		else if (name === "--no-color") globals.noColor = true;
		else if (name === "--help" || name === "-h") globals.help = true;
		else if (name === "--as") globals.as = value();
		else if (name === "--url") globals.url = value();
		else globals.rest.push(arg);
	}
	return globals;
};

const rootUsage = (): string => {
	const width = Math.max(...Object.keys(verbs).map((name) => name.length));
	const commands = Object.entries(verbs).map(([name, verb]) => `  ${name.padEnd(width)}  ${verb.description}`);
	const options = Object.entries(globalArgs).map(([name, arg]) => `  --${name.padEnd(8)}  ${arg.description}`);
	return [
		`${description} (trellis v${cliPkg.version})`,
		"",
		"USAGE trellis [OPTIONS] <command> [args]",
		"",
		"COMMANDS",
		...commands,
		"",
		"OPTIONS",
		...options,
		"",
		"Use trellis <command> --help for more information about a command.",
	].join("\n");
};

const subCommandsOf = async (command: CommandDef): Promise<Record<string, CommandDef> | undefined> => {
	const subs = typeof command.subCommands === "function" ? await command.subCommands() : await command.subCommands;
	if (subs === undefined) return undefined;
	const entries = await Promise.all(
		Object.entries(subs).map(async ([name, sub]) => [name, typeof sub === "function" ? await sub() : await sub]),
	);
	return Object.fromEntries(entries);
};

const usageLine = (out: Stream, message: string) => {
	out.write(`error: ${message} (USAGE)\n`);
	return 2;
};

export const run = async (argv: string[], deps: Deps): Promise<number> => {
	const globals = splitGlobals(argv);
	const color = deps.stdout.isTTY && !globals.noColor && deps.env.NO_COLOR === undefined;
	const mode: Mode = globals.quiet
		? "quiet"
		: globals.jsonl
			? "jsonl"
			: globals.json || !deps.stdout.isTTY
				? "json"
				: "table";
	const format: Format = { mode, color };
	const tint = (text: string) => (color ? text : stripAnsi(text));
	const [verbName, ...rest] = globals.rest;
	if (verbName === undefined) {
		if (globals.help) {
			deps.stdout.write(`${rootUsage()}\n`);
			return 0;
		}
		deps.stderr.write(`${rootUsage()}\n`);
		return 2;
	}
	const verb = verbs[verbName];
	if (verb === undefined) return usageLine(deps.stderr, `unknown command ${verbName}; run trellis --help`);
	let command = await verb.load();
	let parent: CommandDef = { meta: { name: "trellis" } };
	let args = rest;
	const subs = await subCommandsOf(command);
	if (subs !== undefined) {
		const sub = args[0] === undefined ? undefined : subs[args[0]];
		if (sub === undefined && !globals.help) {
			return usageLine(deps.stderr, `${verbName} needs one of ${Object.keys(subs).join(", ")}`);
		}
		if (sub !== undefined) {
			parent = { meta: { name: `trellis ${verbName}`, description: verb.description } };
			command = sub;
			args = args.slice(1);
		}
	}
	if (globals.help) {
		deps.stdout.write(`${tint(await renderUsage(command, parent))}\n`);
		return 0;
	}

	let resolved: ActorResolution | undefined;
	const ctx: CliContext = {
		deps,
		format,
		flags: { json: globals.json, jsonl: globals.jsonl, quiet: globals.quiet },
		url: globals.url ?? deps.env.TRELLIS_URL ?? defaultUrl,
		out: deps.stdout,
		err: deps.stderr,
		actor: () => {
			if (resolved !== undefined) return resolved;
			resolved = resolveActor({ as: globals.as, env: deps.env, gitUserName: deps.gitUserName, osUser: deps.osUser });
			if (resolved.source === "git" && deps.stderr.isTTY) deps.stderr.write(actorHint(resolved));
			return resolved;
		},
	};
	try {
		const { result } = await runCommand(command, { rawArgs: args, data: ctx });
		return typeof result === "number" ? result : 0;
	} catch (error) {
		return report(error, deps.stderr, color);
	}
};

// The exit code of a failed run: 2 for a usage error citty or the CLI
// raised, the mapped code for a contract error, 1 for an undeclared server
// error. Anything else is a bug and crashes with its stack.
const report = (error: unknown, err: Stream, color: boolean): number => {
	if (error instanceof CliFailure) {
		err.write(`${formatFailure(error)}\n`);
		return error.exitCode;
	}
	if (error instanceof Error && error.name === "CLIError") {
		err.write(`error: ${color ? error.message : stripAnsi(error.message)} (USAGE)\n`);
		return 2;
	}
	if (error instanceof ORPCError) {
		err.write(`${formatError(error)}\n`);
		return exitCodeFor(error.code);
	}
	throw error;
};

if (import.meta.main) {
	const controller = new AbortController();
	process.once("SIGINT", () => controller.abort());
	const deps: Deps = {
		fetch: (request, init) => fetch(request, init),
		env: process.env,
		stdout: { write: (text) => void process.stdout.write(text), isTTY: process.stdout.isTTY === true },
		stderr: { write: (text) => void process.stderr.write(text), isTTY: process.stderr.isTTY === true },
		stdin: () => Bun.stdin.text(),
		gitUserName: () => Bun.spawnSync(["git", "config", "user.name"]).stdout.toString().trim(),
		osUser: () => userInfo().username,
		now: () => new Date(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		open: (url) => void Bun.spawn(["open", url]),
		signal: controller.signal,
		apiVersion: apiPkg.version,
	};
	const code = await run(process.argv.slice(2), deps);
	process.stdout.write("", () => process.exit(code));
}
