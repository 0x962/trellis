import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { definedEnvironment, type ExecutionEnvironment } from "../executionEnvironment.ts";

const addEnvironmentRecord = (environment: ExecutionEnvironment, record: string) => {
	const match = record.match(/(?:^|\n)([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
	if (match) environment[match[1]!] = match[2]!;
};

// A login environment can exceed a fixed output limit, so readLoginEnvironmentOnce parses each record as the shell writes it.
const readLoginEnvironmentOnce = (shell: string, env: ExecutionEnvironment, timeoutMs: number) => {
	const child = spawn(shell, ["-ilc", "/usr/bin/env -0"], {
		env: definedEnvironment(env),
		cwd: env.HOME,
		stdio: ["ignore", "pipe", "ignore"],
	});
	const decoder = new StringDecoder("utf8");
	const environment: ExecutionEnvironment = {};
	let recordFragments: string[] = [];
	let timedOut = false;
	const parseOutputChunk = (text: string) => {
		let start = 0;
		let separator = text.indexOf("\0");
		while (separator !== -1) {
			recordFragments.push(text.slice(start, separator));
			addEnvironmentRecord(environment, recordFragments.join(""));
			recordFragments = [];
			start = separator + 1;
			separator = text.indexOf("\0", start);
		}
		if (start < text.length) recordFragments.push(text.slice(start));
	};

	return new Promise<ExecutionEnvironment | undefined>((resolve, reject) => {
		child.stdout.on("data", (chunk: Buffer) => parseOutputChunk(decoder.write(chunk)));
		const timer = setTimeout(() => {
			timedOut = true;
			child.stdout.destroy();
			child.kill();
		}, timeoutMs);
		child.once("error", (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(new Error(`Login shell failed (exit ${error.code}).`));
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			parseOutputChunk(decoder.end());
			if (recordFragments.length > 0) addEnvironmentRecord(environment, recordFragments.join(""));
			if (timedOut) resolve(undefined);
			else if (code !== 0) reject(new Error(`Login shell failed (exit ${code}).`));
			else resolve(environment);
		});
	});
};

// The first login shell of a session starts while the machine is still busy
// with the rest of the boot, so it can need more time than a later one. A
// second run with twice the limit separates a slow machine from a shell that
// never answers.
export const loginEnvironment = async (
	shell: string,
	bundledBin: string,
	env: ExecutionEnvironment = process.env,
	timeoutMs = 10000,
	retryTimeoutMs = timeoutMs * 2,
): Promise<ExecutionEnvironment> => {
	const environment =
		(await readLoginEnvironmentOnce(shell, env, timeoutMs)) ??
		(await readLoginEnvironmentOnce(shell, env, retryTimeoutMs));
	if (environment === undefined)
		throw new Error(
			`The login shell did not answer within ${retryTimeoutMs} ms. Check the shell startup files, then retry.`,
		);
	if (!environment.PATH) throw new Error("The login shell did not return PATH. Check the shell startup files.");
	environment.PATH = `${bundledBin}:${environment.PATH}`;
	return environment;
};
