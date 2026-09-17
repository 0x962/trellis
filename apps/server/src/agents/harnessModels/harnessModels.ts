import { spawn } from "node:child_process";
import { type BuiltInHarness, catalogModelFor, type HarnessModel } from "@trellis/api";
import { CLAUDE_MODELS_ARGS, CLAUDE_MODELS_REQUEST, parseClaudeModels } from "../harnesses/claude/claudeModels.ts";
import { CODEX_MODELS_ARGS, CODEX_MODELS_REQUESTS, parseCodexModelsLine } from "../harnesses/codex/codexModels.ts";
import { MspClient } from "../harnesses/muse/mspClient.ts";
import { MUSE_MODELS_ARGS, parseMuseModels } from "../harnesses/muse/museModels.ts";
import { OPENCODE_MODELS_ARGS, parseOpenCodeModels } from "../harnesses/opencode/opencodeModels.ts";
import { PI_MODELS_ARGS, parsePiModels } from "../harnesses/pi/piModels.ts";
import type { ListedModel } from "../harnesses/types.ts";
import { resolveExecutable } from "../harnessHost/resolveExecutable.ts";

// The models a built-in harness offers, asked from the harness program on
// PATH. Each query runs the program once and takes one to two seconds. A
// program that runs longer than TIMEOUT_MS is killed, and its partial
// output fails the parse. The claude query starts a session, and a claude
// session runs the SessionStart hooks of its working directory. Every
// program runs in `cwd`, the data home, so no hook of a project runs.
//
// A program names its models the way its own model flag takes them.
// `projects.managerConfig` stores a canonical trellis model id instead, so
// `catalogModelFor` turns each name into that id. A model the program
// offers and `catalog.json` does not hold leaves the list, because a
// project cannot store it and `toHarnessModel` cannot launch it.

const TIMEOUT_MS = 30000;

type Env = Record<string, string | undefined>;
// Where the harness program runs and what it reads from its environment.
type Spawn = { cwd: string; env: Env };

// Runs a program to its end and returns both output streams. `stdin` is
// written whole and then closed.
const capture = async (command: string[], { cwd, env }: Spawn, stdin?: string) => {
	const proc = Bun.spawn(command, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS });
	if (stdin !== undefined) proc.stdin.write(stdin);
	proc.stdin.end();
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`${command[0]} exited ${code}: ${(stderr || stdout).trim()}`);
	return { stdout, stderr };
};

// Reads stdout line by line until `parse` returns the models, then closes
// stdin so the app server exits.
const listCodex = async (executable: string, { cwd, env }: Spawn): Promise<ListedModel[]> => {
	const proc = Bun.spawn([executable, ...CODEX_MODELS_ARGS], {
		cwd,
		env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		timeout: TIMEOUT_MS,
	});
	proc.stdin.write(CODEX_MODELS_REQUESTS);
	const stderr = new Response(proc.stderr).text();
	let pending = "";
	try {
		for await (const chunk of proc.stdout) {
			pending += Buffer.from(chunk).toString();
			const lines = pending.split("\n");
			pending = lines.pop()!;
			for (const text of lines) {
				const models = parseCodexModelsLine(text);
				if (models !== null) return models;
			}
		}
	} finally {
		proc.stdin.end();
		await proc.exited;
	}
	throw new Error(`codex exited ${proc.exitCode} before it listed its models: ${(await stderr).trim()}`);
};

// Asks one `muse serve` session host for the catalog of its account, then
// closes it. Nothing here waits for that host to exit, and `closed` rejects
// on the exit, so this takes the rejection to keep it off the server.
const listMuse = async (executable: string, { cwd, env }: Spawn): Promise<ListedModel[]> => {
	const child = spawn(executable, MUSE_MODELS_ARGS, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
	const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
	const client = new MspClient(child, () => {});
	client.closed.catch(() => {});
	try {
		await client.initialize();
		return parseMuseModels(await client.request("model/list", {}));
	} finally {
		clearTimeout(timer);
		client.close();
	}
};

const listers: Record<BuiltInHarness, (executable: string, spawn: Spawn) => Promise<ListedModel[]>> = {
	claude: async (executable, spawn) =>
		parseClaudeModels((await capture([executable, ...CLAUDE_MODELS_ARGS], spawn, CLAUDE_MODELS_REQUEST)).stdout),
	codex: listCodex,
	opencode: async (executable, spawn) =>
		parseOpenCodeModels((await capture([executable, ...OPENCODE_MODELS_ARGS], spawn)).stdout),
	// pi writes the table to stderr when stdout is not a terminal.
	pi: async (executable, spawn) => {
		const output = await capture([executable, ...PI_MODELS_ARGS], spawn);
		return parsePiModels(`${output.stdout}\n${output.stderr}`);
	},
	muse: listMuse,
};

// Two names a program lists can carry one canonical id, such as the claude
// alias `sonnet` and the full `claude-sonnet-5`. The picker holds one row
// per id, and the first name the program listed names it.
const catalogued = (harness: BuiltInHarness, listed: ListedModel[]): HarnessModel[] => {
	const models = new Map<string, HarnessModel>();
	for (const model of listed) {
		const value = catalogModelFor(harness, model.name);
		if (value !== undefined && !models.has(value)) models.set(value, { value, label: model.label });
	}
	return [...models.values()];
};

export const listHarnessModels = async (harness: BuiltInHarness, spawn: Spawn): Promise<HarnessModel[]> =>
	catalogued(harness, await listers[harness](await resolveExecutable(harness, spawn.env.PATH ?? ""), spawn));
