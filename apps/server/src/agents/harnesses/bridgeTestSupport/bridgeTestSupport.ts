import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent, RuntimeRequest } from "@trellis/runtime-protocol";

export type RuntimeAnswer = { refuse?: boolean; delayMs?: number };

export async function scratchHome(cleanups: (() => Promise<unknown>)[]) {
	const home = await mkdtemp(join(tmpdir(), "trellis-bridge-"));
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	return home;
}

// A runtime socket that answers `observe`. `answerFor` decides what each event
// gets: a refusal carries `refusalText`, and `delayMs` holds the reply back. A
// held reply gives a test the time to act while the bridge waits.
export async function fakeRuntimeSocket(
	home: string,
	cleanups: (() => Promise<unknown>)[],
	answerFor: (event: HarnessEvent) => RuntimeAnswer,
	refusalText: string,
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
				const answer = answerFor(event);
				const reply = answer.refuse
					? { id: request.id, error: { code: "unavailable", message: refusalText } }
					: { id: request.id, result: {} };
				const send = () => socket.write(`${JSON.stringify(reply)}\n`);
				if (answer.delayMs === undefined) send();
				else setTimeout(send, answer.delayMs);
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

// A bridge spawns this program by path, so it needs the execute permission and
// a shebang line.
export async function writeExecutable(path: string, body: string) {
	await writeFile(path, body, { mode: 0o755 });
	return path;
}

// `script` gives the bridge a terminal on standard input, the way the runtime
// starts it. The Muse bridge reads that terminal for a follow-up prompt.
export function spawnBridge(options: {
	entry: string;
	env: Record<string, string>;
	launch: Record<string, unknown>;
	withTerminal?: boolean;
}) {
	const command = [process.execPath, options.entry, JSON.stringify(options.launch)];
	const child = Bun.spawn(options.withTerminal ? ["script", "-q", "/dev/null", ...command] : command, {
		env: { PATH: process.env.PATH ?? "", ...options.env },
		stdout: "pipe",
		stderr: "pipe",
	});
	// `script` gives the bridge one terminal for its standard output and its
	// standard error stream, so a test that runs the bridge with a terminal
	// reads both of them in `output`.
	let output = "";
	const reading = (async () => {
		for await (const chunk of child.stdout) output += new TextDecoder().decode(chunk);
	})();
	return {
		child,
		async finish() {
			const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			await reading;
			return { exitCode, stderr, output };
		},
	};
}

// A test acts while the bridge waits for the answer to that write.
export async function eventArrived(observed: HarnessEvent[], kind: string) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (observed.some((event) => event.kind === kind)) return true;
		await Bun.sleep(25);
	}
	return false;
}
