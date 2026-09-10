import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";

export const repoRoot = resolve(import.meta.dir, "../../..");
export const cliDir = join(repoRoot, "packages", "cli");
export const cliEntry = join(cliDir, "src", "index.ts");

export type ProcessResult = { code: number; stdout: string; stderr: string };

export const processEnv = (values: Record<string, string | undefined> = {}) => ({
	...process.env,
	TRELLIS_ACTOR: "human:smoke",
	...values,
});

export const runProcess = async (
	args: string[],
	env: Record<string, string | undefined> = {},
): Promise<ProcessResult> => {
	const proc = Bun.spawn(["bun", cliEntry, ...args], {
		cwd: cliDir,
		env: processEnv(env),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
};

const linesFrom = async (stream: ReadableStream<Uint8Array>, onLine: (line: string) => Promise<void> | void) => {
	let buffer = "";
	for await (const chunk of stream) {
		buffer += new TextDecoder().decode(chunk);
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) if (line !== "") await onLine(line);
	}
	if (buffer !== "") await onLine(buffer);
};

export const watchOne = async (
	url: string,
	ticket: string,
	type: string,
	trigger: () => Promise<void>,
	env: Record<string, string | undefined> = {},
) => {
	const proc = Bun.spawn(["bun", cliEntry, "watch", "--ticket", ticket, "--url", url], {
		cwd: cliDir,
		env: processEnv(env),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const events: Array<Record<string, unknown>> = [];
	let triggered = false;
	const stderr = new Response(proc.stderr).text();
	const output = linesFrom(proc.stdout, async (line) => {
		const event = JSON.parse(line) as Record<string, unknown>;
		events.push(event);
		if (event.type === "ready" && !triggered) {
			triggered = true;
			await trigger();
		}
		if (event.type === type) proc.kill("SIGINT");
	});
	const timeout = Bun.sleep(20_000).then(() => {
		proc.kill("SIGKILL");
		throw new Error(`watch did not receive ${type}`);
	});
	const code = await Promise.race([proc.exited, timeout]);
	await output;
	return { code, stderr: await stderr, events };
};

export const followLog = async (home: string, append: string) => {
	const proc = Bun.spawn(["bun", cliEntry, "logs", "--lines", "1", "--follow"], {
		cwd: cliDir,
		env: processEnv({ TRELLIS_HOME: home }),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const lines: string[] = [];
	const stderr = new Response(proc.stderr).text();
	const output = linesFrom(proc.stdout, (line) => {
		lines.push(line);
		if (lines.length === 1) appendFileSync(join(home, "server.log"), `${append}\n`);
		if (line === append) proc.kill("SIGINT");
	});
	const timeout = Bun.sleep(20_000).then(() => {
		proc.kill("SIGKILL");
		throw new Error("logs --follow did not print the appended line");
	});
	const code = await Promise.race([proc.exited, timeout]);
	await output;
	return { code, stderr: await stderr, lines };
};

type StartedCliServer = {
	proc: Subprocess<"ignore", "pipe", "pipe">;
	url: string;
	stop: () => Promise<ProcessResult>;
};

export const startCliServer = async (
	home: string,
	env: Record<string, string | undefined> = {},
): Promise<StartedCliServer> => {
	const proc = Bun.spawn(["bun", cliEntry, "serve"], {
		cwd: cliDir,
		env: processEnv({ TRELLIS_HOME: home, TRELLIS_PORT: "0", ...env }),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout: string[] = [];
	const stderr: string[] = [];
	let resolvePort!: (port: number) => void;
	const port = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});
	const output = linesFrom(proc.stdout, (line) => {
		stdout.push(line);
		if (!line.startsWith("{")) return;
		const record = JSON.parse(line) as { msg?: string; port?: number };
		if (record.msg === "listening") resolvePort(record.port!);
	});
	const errors = linesFrom(proc.stderr, (line) => {
		stderr.push(line);
	});
	const started = await Promise.race([
		port,
		proc.exited.then((code) => {
			throw new Error(`trellis serve exited ${code} before it listened`);
		}),
	]);
	return {
		proc,
		url: `http://127.0.0.1:${started}`,
		stop: async () => {
			proc.kill("SIGTERM");
			const code = await proc.exited;
			await Promise.all([output, errors]);
			return { code, stdout: `${stdout.join("\n")}\n`, stderr: `${stderr.join("\n")}${stderr.length ? "\n" : ""}` };
		},
	};
};
