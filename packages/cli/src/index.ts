#!/usr/bin/env bun
import { homedir, userInfo } from "node:os";
import { ORPCError } from "@orpc/client";
import { type ArgsDef, type CommandDef, defineCommand, renderUsage, runCommand } from "citty";
import apiPkg from "../../api/package.json" with { type: "json" };
import cliPkg from "../package.json" with { type: "json" };
import { type ActorResolution, actorHint, resolveActor } from "./actor.ts";
import type { CliContext } from "./context.ts";
import { CliFailure, exitCodeFor, formatError, formatFailure, usageError } from "./errors.ts";
import { checkFlags, valuedSpellings } from "./flags.ts";
import { type Format, type Mode, stripAnsi } from "./output.ts";
import { verbs } from "./verbs.ts";

export type Stream = { write(text: string): void; isTTY: boolean };

// Every effect of a run goes through here, so a test injects the server,
// the streams, the environment, the clock, and the git and OS lookups.
export type Deps = {
	fetch: (request: Request, init: { redirect?: Request["redirect"]; signal?: AbortSignal }) => Promise<Response>;
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
	// Runs a program to its end. install and uninstall send launchctl and the
	// web build through it, so a test records the calls and starts nothing.
	run: (args: string[], cwd?: string) => Promise<{ code: number; stderr: string }>;
	// The launchd domain that install and uninstall address: `gui/<uid>`.
	launchdDomain: string;
	// The user home. install, uninstall, serve, and restore derive every path
	// under it, so a test that injects a temporary home never writes the real
	// LaunchAgents directory, the real shim, or the real gateway routes file.
	home: string;
	// The path of a program on PATH, with no symlink resolved, or null when
	// PATH has no such program. install names the bun it finds here.
	which: (name: string) => string | null;
	// Starts a program that shares the terminal of the CLI. serve starts the
	// server through it, so a test records the call and starts nothing.
	spawn: (
		args: string[],
		options: { cwd: string; env: Record<string, string | undefined> },
	) => { exited: Promise<number>; kill: (signal: NodeJS.Signals) => void };
};

export const defaultUrl = "http://127.0.0.1:4521";

// The origin of a ticket URL. TRELLIS_PUBLIC_URL names it when a gateway or a
// proxy serves the server under another name; otherwise the server URL serves
// the web app too. A trailing slash would double the slash in the path.
export const publicOrigin = (env: Record<string, string | undefined>, url: string): string =>
	(env.TRELLIS_PUBLIC_URL ?? url).replace(/\/+$/, "");

const globalArgs = {
	json: { type: "boolean", description: "Print the procedure output as JSON" },
	jsonl: { type: "boolean", description: "Print one JSON object per line" },
	quiet: { type: "boolean", description: "Print one identifier per line" },
	as: { type: "string", valueHint: "kind:name|name", description: "Act as this actor" },
	url: { type: "string", valueHint: "url", description: `Server URL (TRELLIS_URL, default ${defaultUrl})` },
	"no-color": { type: "boolean", description: "Print no ANSI escape sequences" },
} satisfies ArgsDef;

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

// Global flags parse before dispatch and in any position. `--as` and
// `--url` take one value. Either flag at the end of the line has none, and
// that is a usage error: a missing value never falls back to the inferred
// actor or the default URL.
//
// `valued` names every spelling of every flag of the command that takes a
// value. The token after one of those flags is that value, so it stays in
// `rest`: `comment CDE-42 --body --help` writes the comment `--help`. The
// caller knows the command only after it reads the verb name out of `rest`,
// so it splits twice: once with no names, and once with the command's own.
// `--` and every token after it stay in `rest` as well.
export const splitGlobals = (argv: string[], valued: Set<string> = new Set()): Globals => {
	const globals: Globals = { json: false, jsonl: false, quiet: false, noColor: false, help: false, rest: [] };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		if (arg === "--") {
			globals.rest.push(...argv.slice(index));
			return globals;
		}
		const equals = arg.indexOf("=");
		const name = equals === -1 ? arg : arg.slice(0, equals);
		const value = () => {
			if (equals !== -1) return arg.slice(equals + 1);
			if (index + 1 === argv.length) throw usageError(`${name} needs a value`);
			return argv[++index];
		};
		const isFlag = arg.startsWith("-") && arg !== "-";
		if (isFlag && equals === -1 && index + 1 < argv.length && valued.has(name.replace(/^--?/, ""))) {
			globals.rest.push(arg, argv[++index]!);
		} else if (name === "--json") globals.json = true;
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
	let globals: Globals;
	try {
		globals = splitGlobals(argv);
	} catch (error) {
		return report(error, deps.stderr, false);
	}
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
	let usage = `trellis ${verbName}`;
	// The tokens of `argv` that name the verb and its subverb. The command
	// takes everything after them.
	let named = 1;
	const subs = await subCommandsOf(command);
	if (subs !== undefined) {
		const subName = rest[0];
		const sub = subName === undefined ? undefined : subs[subName];
		if (sub === undefined && !globals.help) {
			return usageLine(deps.stderr, `${verbName} needs one of ${Object.keys(subs).join(", ")}`);
		}
		if (sub !== undefined) {
			parent = { meta: { name: usage, description: verb.description } };
			usage = `${usage} ${subName}`;
			command = sub;
			named = 2;
		}
	}
	// The command is known, so its own flags are known. Split again: a global
	// flag spelling that follows one of them is its value, not a global flag.
	// This split reads fewer tokens as global flags than the first one, so it
	// raises no usage error the first one did not already raise.
	globals = splitGlobals(argv, valuedSpellings((command.args ?? {}) as ArgsDef));
	const args = globals.rest.slice(named);
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
		publicUrl: publicOrigin(deps.env, globals.url ?? deps.env.TRELLIS_URL ?? defaultUrl),
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
		checkFlags(args, (command.args ?? {}) as ArgsDef, usage);
		const { result } = await runCommand(command, { rawArgs: args, data: ctx });
		return typeof result === "number" ? result : 0;
	} catch (error) {
		// Ctrl-C aborts every request in flight. The person who pressed it
		// knows why the run stopped, so it stops with the shell's code for an
		// interrupt and writes no line.
		if (deps.signal.aborted) return 130;
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
		run: async (args, cwd) => {
			const proc = Bun.spawn(args, { cwd, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
			const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
			return { code, stderr: stderr.trim() };
		},
		launchdDomain: `gui/${process.getuid!()}`,
		home: homedir(),
		which: (name) => Bun.which(name),
		spawn: (args, { cwd, env }) =>
			Bun.spawn(args, { cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" }),
	};
	const code = await run(process.argv.slice(2), deps);
	process.exitCode = code;
}
