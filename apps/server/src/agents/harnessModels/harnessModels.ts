import type { BuiltInHarness, HarnessModel } from "@trellis/api";
import { CLAUDE_MODELS_ARGS, CLAUDE_MODELS_REQUEST, parseClaudeModels } from "../harnesses/claude/claudeModels.ts";
import { CODEX_MODELS_ARGS, CODEX_MODELS_REQUESTS, parseCodexModelsLine } from "../harnesses/codex/codexModels.ts";
import { OPENCODE_MODELS_ARGS, parseOpenCodeModels } from "../harnesses/opencode/opencodeModels.ts";
import { PI_MODELS_ARGS, parsePiModels } from "../harnesses/pi/piModels.ts";
import { resolveExecutable } from "../harnessHost/resolveExecutable.ts";

// The models a built-in harness offers, asked from the harness program on
// PATH. Each query runs the program once and takes one to two seconds. A
// program that runs longer than TIMEOUT_MS is killed, and its partial
// output fails the parse.

const TIMEOUT_MS = 30000;

type Env = Record<string, string | undefined>;

// Runs a program to its end and returns both output streams. `stdin` is
// written whole and then closed.
const capture = async (command: string[], env: Env, stdin?: string) => {
	const proc = Bun.spawn(command, { env, stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS });
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
const listCodex = async (executable: string, env: Env): Promise<HarnessModel[]> => {
	const proc = Bun.spawn([executable, ...CODEX_MODELS_ARGS], {
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

const listers: Record<BuiltInHarness, (executable: string, env: Env) => Promise<HarnessModel[]>> = {
	claude: async (executable, env) =>
		parseClaudeModels((await capture([executable, ...CLAUDE_MODELS_ARGS], env, CLAUDE_MODELS_REQUEST)).stdout),
	codex: listCodex,
	opencode: async (executable, env) =>
		parseOpenCodeModels((await capture([executable, ...OPENCODE_MODELS_ARGS], env)).stdout),
	// pi writes the table to stderr when stdout is not a terminal.
	pi: async (executable, env) => {
		const output = await capture([executable, ...PI_MODELS_ARGS], env);
		return parsePiModels(`${output.stdout}\n${output.stderr}`);
	},
};

export const listHarnessModels = async (harness: BuiltInHarness, env: Env): Promise<HarnessModel[]> =>
	listers[harness](await resolveExecutable(harness, env.PATH ?? ""), env);
