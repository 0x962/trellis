import { join } from "node:path";
import type { Subprocess } from "bun";

// spawnServer runs the real boot, `bun src/index.ts`, in a child process
// with a temporary data home and port 0, so the kernel picks a free port.
// The child logs JSON lines to stdout, because stdout is a pipe and not a
// TTY. The helper reads them as records and resolves `listening` when the
// boot logs that line, which carries the port.

export type Record_ = { msg: string; level: string; [key: string]: unknown };

const serverDir = join(import.meta.dir, "..", "..");

export type SpawnOptions = {
	home: string;
	env?: Record<string, string>;
};

export const spawnServer = (options: SpawnOptions) => {
	const proc: Subprocess<"ignore", "pipe", "pipe"> = Bun.spawn(["bun", "src/index.ts"], {
		cwd: serverDir,
		env: {
			...process.env,
			NODE_ENV: "production",
			TRELLIS_HOME: options.home,
			TRELLIS_PORT: "0",
			...options.env,
		},
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const startedAt = Date.now();
	const records: Record_[] = [];
	const stderr: string[] = [];
	const waiters: Array<{ msg: string; resolve: (record: Record_) => void }> = [];

	const push = (line: string) => {
		const record = JSON.parse(line) as Record_;
		records.push(record);
		for (const waiter of waiters.splice(0)) {
			if (waiter.msg === record.msg) waiter.resolve(record);
			else waiters.push(waiter);
		}
	};

	const drain = async (stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) => {
		let buffer = "";
		for await (const chunk of stream) {
			buffer += new TextDecoder().decode(chunk);
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) if (line.length > 0) onLine(line);
		}
		if (buffer.length > 0) onLine(buffer);
	};
	const stdoutDone = drain(proc.stdout, push);
	const stderrDone = drain(proc.stderr, (line) => stderr.push(line));

	// Resolves with the first record whose `msg` matches, or rejects once the
	// child exits without it.
	const waitFor = (msg: string): Promise<Record_> => {
		const found = records.find((record) => record.msg === msg);
		if (found !== undefined) return Promise.resolve(found);
		return Promise.race([
			new Promise<Record_>((resolve) => waiters.push({ msg, resolve })),
			proc.exited.then(async (code) => {
				await stderrDone;
				throw new Error(`the server exited ${code} before it logged ${msg}: ${stderr.join(" | ")}`);
			}),
		]);
	};

	const listening = async () => {
		const record = await waitFor("listening");
		return { port: record.port as number, url: `http://127.0.0.1:${record.port}`, at: Date.now() };
	};

	const exited = async () => {
		const code = await proc.exited;
		await Promise.all([stdoutDone, stderrDone]);
		return code;
	};

	return {
		proc,
		records,
		stderr,
		startedAt,
		waitFor,
		listening,
		exited,
		kill: (signal: NodeJS.Signals) => proc.kill(signal),
	};
};

export type SpawnedServer = ReturnType<typeof spawnServer>;

// Sends SIGTERM when the child still runs, so a failed test leaves no server.
export const stopServer = async (server: SpawnedServer) => {
	if (server.proc.exitCode === null) server.kill("SIGTERM");
	await server.exited();
};
