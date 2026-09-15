import { createInterface } from "node:readline";
import { spawn } from "node-pty";
import { stopProcessTree } from "../../runtime/src/stopProcessTree.ts";

let terminal;
let stopping = false;
const exited = Promise.withResolvers();
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const stop = async () => {
	if (stopping) return;
	stopping = true;
	await stopProcessTree(terminal.pid);
	const exit = await exited.promise;
	process.stdout.write(`${JSON.stringify({ type: "exit", ...exit })}\n`, () => process.exit(0));
};
createInterface({ input: process.stdin }).on("line", (line) => {
	const message = JSON.parse(line);
	if (message.type === "start") {
		terminal = spawn(message.launch.executable, message.launch.args, {
			cwd: message.cwd,
			env: message.env,
			cols: 120,
			rows: 32,
			name: "xterm-256color",
		});
		terminal.onData((data) => send({ type: "output", data }));
		terminal.onExit((exit) => {
			exited.resolve(exit);
			void stop();
		});
		send({ type: "ready", pid: terminal.pid });
	} else if (message.type === "input") terminal.write(message.data);
	else if (message.type === "stop") void stop();
});
process.stdin.on("end", () => {
	if (terminal) void stop();
	else process.exit(0);
});
