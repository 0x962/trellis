import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { definedEnvironment, type ExecutionEnvironment } from "../executionEnvironment.ts";

const addRecord = (result: ExecutionEnvironment, record: string) => {
	const match = record.match(/(?:^|\n)([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
	if (match) result[match[1]!] = match[2]!;
};

// `capture` parses each NUL-separated record as the login shell writes it. This
// keeps the total environment size independent from a subprocess output buffer.
const capture = (shell: string, env: ExecutionEnvironment, timeoutMs: number) => {
	const child = spawn(shell, ["-ilc", "/usr/bin/env -0"], {
		env: definedEnvironment(env),
		cwd: env.HOME,
		stdio: ["ignore", "pipe", "ignore"],
	});
	const decoder = new StringDecoder("utf8");
	const result: ExecutionEnvironment = {};
	let recordParts: string[] = [];
	let timedOut = false;
	const parse = (text: string) => {
		let start = 0;
		let separator = text.indexOf("\0");
		while (separator !== -1) {
			recordParts.push(text.slice(start, separator));
			addRecord(result, recordParts.join(""));
			recordParts = [];
			start = separator + 1;
			separator = text.indexOf("\0", start);
		}
		if (start < text.length) recordParts.push(text.slice(start));
	};

	return new Promise<ExecutionEnvironment | undefined>((resolve, reject) => {
		child.stdout.on("data", (chunk: Buffer) => parse(decoder.write(chunk)));
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs);
		child.once("error", (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(new Error(`Login shell failed (exit ${error.code}).`));
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			parse(decoder.end());
			if (recordParts.length > 0) addRecord(result, recordParts.join(""));
			if (timedOut) resolve(undefined);
			else if (code !== 0) reject(new Error(`Login shell failed (exit ${code}).`));
			else resolve(result);
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
	const result = (await capture(shell, env, timeoutMs)) ?? (await capture(shell, env, retryTimeoutMs));
	if (result === undefined)
		throw new Error(
			`The login shell did not answer within ${retryTimeoutMs} ms. Check the shell startup files, then retry.`,
		);
	if (!result.PATH) throw new Error("The login shell did not return PATH. Check the shell startup files.");
	result.PATH = `${bundledBin}:${result.PATH}`;
	return result;
};
