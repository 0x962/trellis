import type { Deps } from "../src/index.ts";
import { run } from "../src/index.ts";
import { apiVersion, type Call, type FakeServerOptions, fakeServer, type Routes } from "./fakeServer.ts";

// `run(argv, deps)` is the whole CLI without the process. Every effect goes
// through `deps`. A test injects the server, the streams, the environment,
// the clock, and the git and OS lookups, and reads back the exit code.
//
// The `Deps` shape src/index.ts exports:
//   fetch(request, init)   the RPC link and the SSE reader call it; a test hands in the fake server
//   env                    the process environment the CLI reads (TRELLIS_URL, TRELLIS_ACTOR, markers)
//   stdout, stderr         { write(text), isTTY }
//   stdin()                the whole standard input as text, for `-d -` and `--body -`
//   gitUserName()          `git config user.name`, "" when unset
//   osUser()               the OS user name
//   now()                  the clock behind `--updated 24h`
//   sleep(ms)              the reconnect backoff of `watch`
//   open(url)              the browser opener behind `open --browser`
//   signal                 fires on SIGINT; `watch` stops on it
//   apiVersion             the api version the CLI was built against
//   run(args, cwd)         runs a program; install and uninstall send launchctl and the web build through it
//   launchdDomain          the launchd domain install and uninstall address, `gui/<uid>` in a real run
//
// The default `run` records each call in `commands` and returns exit code 0,
// so a test never starts a real program through the CLI.
export type CommandCall = { args: string[]; cwd?: string };

export type RunOptions = FakeServerOptions & {
	tty?: boolean;
	stderrTty?: boolean;
	env?: Record<string, string | undefined>;
	stdin?: string;
	gitUserName?: string;
	osUser?: string;
	now?: string;
	apiVersion?: string;
	fetch?: Deps["fetch"];
	signal?: AbortSignal;
	open?: (url: string) => void;
	run?: Deps["run"];
	launchdDomain?: string;
};

export type RunResult = {
	code: number;
	stdout: string;
	stderr: string;
	calls: Call[];
	requests: Request[];
	sleeps: number[];
	commands: CommandCall[];
};

// Inside Claude Code by default, so the actor is `agent:claude-code` with
// session `session_abc` and no git lookup happens. Both streams are pipes.
export const defaultEnv = { CLAUDECODE: "1", CLAUDE_SESSION_ID: "session_abc" };

export const makeDeps = (routes: Routes = {}, options: RunOptions = {}) => {
	let out = "";
	let err = "";
	const sleeps: number[] = [];
	const commands: CommandCall[] = [];
	const server = fakeServer(routes, { serverApiVersion: options.serverApiVersion, raw: options.raw });
	const deps: Deps = {
		fetch: options.fetch ?? server.fetch,
		env: options.env ?? defaultEnv,
		stdout: {
			write: (text: string) => {
				out += text;
			},
			isTTY: options.tty ?? false,
		},
		stderr: {
			write: (text: string) => {
				err += text;
			},
			isTTY: options.stderrTty ?? false,
		},
		stdin: async () => options.stdin ?? "",
		gitUserName: () => options.gitUserName ?? "",
		osUser: () => options.osUser ?? "navid",
		now: () => new Date(options.now ?? "2026-09-09T12:00:00Z"),
		sleep: async (ms: number) => {
			sleeps.push(ms);
		},
		open: options.open ?? (() => {}),
		signal: options.signal ?? new AbortController().signal,
		apiVersion: options.apiVersion ?? apiVersion,
		run:
			options.run ??
			(async (args, cwd) => {
				commands.push(cwd === undefined ? { args } : { args, cwd });
				return { code: 0, stderr: "" };
			}),
		launchdDomain: options.launchdDomain ?? "gui/test",
	};
	return { deps, server, stdout: () => out, stderr: () => err, sleeps, commands };
};

export const runCli = async (argv: string[], routes: Routes = {}, options: RunOptions = {}): Promise<RunResult> => {
	const { deps, server, stdout, stderr, sleeps, commands } = makeDeps(routes, options);
	const code = await run(argv, deps);
	return {
		code,
		stdout: stdout(),
		stderr: stderr(),
		calls: server.calls,
		requests: server.requests,
		sleeps,
		commands,
	};
};

// The lines of a stream, without the trailing newline.
export const lines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
