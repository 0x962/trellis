import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent, RuntimeRequest } from "@trellis/runtime-protocol";

// The parts a bridge test needs around the real bridge entry file: a scratch
// directory, a runtime socket that the test controls, a stand-in harness
// executable, and one bridge process.

export type RuntimeAnswer = { refuse?: boolean; delayMs?: number };

export async function scratchHome(cleanups: (() => Promise<unknown>)[]) {
	const home = await mkdtemp(join(tmpdir(), "trellis-bridge-"));
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	return home;
}

// A runtime socket that answers `observe`. `answer` decides what each event
// gets: a refusal carries `message`, and `delayMs` holds the reply back. A
// held reply gives a test the time to act while the bridge waits.
export async function fakeRuntimeSocket(
	home: string,
	cleanups: (() => Promise<unknown>)[],
	answer: (event: HarnessEvent) => RuntimeAnswer,
	message: string,
) {
	const path = join(home, "runtime.sock");
	const observed: HarnessEvent[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			// One chunk can carry several requests, or half of one. The socket
			// answers each complete line and keeps the rest.
			for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
				const request = JSON.parse(buffer.slice(0, end)) as RuntimeRequest;
				buffer = buffer.slice(end + 1);
				const { event } = request.params as { event: HarnessEvent };
				observed.push(event);
				const decision = answer(event);
				const reply = decision.refuse
					? { id: request.id, error: { code: "unavailable", message } }
					: { id: request.id, result: {} };
				const send = () => socket.write(`${JSON.stringify(reply)}\n`);
				if (decision.delayMs === undefined) send();
				else setTimeout(send, decision.delayMs);
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	cleanups.push(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return { path, observed };
}

// Writes a program that stands in for a harness executable. A bridge spawns it
// by path, so it needs the execute permission and a shebang line.
export async function writeExecutable(path: string, body: string) {
	await writeFile(path, body, { mode: 0o755 });
	return path;
}

// Starts one bridge process. `script` gives the bridge a terminal on standard
// input, the way the runtime starts it. The Muse bridge reads that terminal
// for a follow-up prompt.
export function spawnBridge(options: {
	entry: string;
	env: Record<string, string>;
	launch: Record<string, unknown>;
	withTerminal?: boolean;
}) {
	const command = [process.execPath, options.entry, JSON.stringify(options.launch)];
	// `script` reads its own terminal, so a test cannot type into the bridge
	// through it. `museTerminal.test.ts` covers what the reader does with a
	// typed line.
	const child = Bun.spawn(options.withTerminal ? ["script", "-q", "/dev/null", ...command] : command, {
		env: { PATH: process.env.PATH ?? "", ...options.env },
		stdout: "pipe",
		stderr: "pipe",
	});
	let output = "";
	const reading = (async () => {
		for await (const chunk of child.stdout) output += new TextDecoder().decode(chunk);
	})();
	return {
		child,
		// Everything the bridge printed so far. Under `script` the terminal
		// carries the standard output and the standard error stream together.
		text: () => output,
		async finish() {
			const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			await reading;
			return { exitCode, stderr, stdout: output };
		},
	};
}
