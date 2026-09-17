import { appendFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import WebSocket, { WebSocketServer } from "ws";

const args = process.argv.slice(2);
const behavior = process.env.HARNESS_FIXTURE_BEHAVIOR;
if (behavior === "crash") process.exit(7);
if (args.includes("--stdio")) {
	const lines = createInterface({ input: process.stdin });
	lines.on("line", (line) => {
		const request = JSON.parse(line);
		if (request.id !== undefined)
			process.stdout.write(
				`${JSON.stringify({ id: request.id, result: request.method === "hooks/list" ? { data: [{ errors: [], hooks: [] }] } : {} })}\n`,
			);
	});
} else if (args[0] === "app-server") {
	appendFileSync(join(dirname(process.argv[1]!), "codex-engines.txt"), `${process.pid}\n`);
	const server = createServer();
	const sockets = new WebSocketServer({ server, perMessageDeflate: false });
	process.on("SIGUSR1", () => {
		for (const socket of sockets.clients) socket.close();
	});
	let turn = 0;
	let activeTurn = "";
	let model = "gpt-5.6-sol";
	const notify = (method: string, params: object) => {
		for (const client of sockets.clients)
			client.send(JSON.stringify({ method, params: { threadId: "provider-codex", ...params } }));
	};
	const complete = (status: string) => {
		if (status === "completed")
			notify("item/completed", {
				turnId: activeTurn,
				item: { id: "answer", type: "agentMessage", phase: "final_answer", text: "fixture result" },
			});
		notify("turn/completed", { turn: { id: activeTurn, status, items: [] } });
	};
	sockets.on("connection", (socket) =>
		socket.on("message", (bytes) => {
			const request = JSON.parse(bytes.toString());
			const reply = (result: unknown) => socket.send(JSON.stringify({ id: request.id, result }));
			if (request.id === 100 && request.method === undefined) {
				if (request.error)
					notify("error", {
						turnId: activeTurn,
						willRetry: false,
						error: { message: "Observer rejected the native question" },
					});
				else complete("completed");
				return;
			}
			if (request.method === "initialize") return reply({ userAgent: "fixture" });
			if (request.method === "initialized") return;
			if (["thread/start", "thread/resume"].includes(request.method)) {
				model = request.params.model ?? model;
				return reply({
					thread: { id: "provider-codex" },
					model,
					approvalPolicy: "never",
					sandbox: { type: "dangerFullAccess" },
				});
			}
			if (request.method === "turn/interrupt") {
				reply({});
				return complete(behavior === "normal-interrupt" ? "completed" : "interrupted");
			}
			if (request.method === "turn/start") {
				activeTurn = `turn-${++turn}`;
				if (behavior === "terminal-spawn-error") unlinkSync(process.argv[1]!);
				reply({ turn: { id: activeTurn } });
				if (behavior === "silent") return;
				notify("turn/started", { turn: { id: activeTurn } });
				notify("item/started", {
					turnId: activeTurn,
					item: { id: `user-${turn}`, type: "userMessage", content: request.params.input },
				});
				notify("item/started", {
					turnId: activeTurn,
					item: { id: `tool-${turn}`, type: "commandExecution", command: "pwd" },
				});
				if (behavior === "question" && turn > 1) {
					for (const client of sockets.clients)
						client.send(
							JSON.stringify({
								id: 100,
								method: "item/tool/requestUserInput",
								params: { threadId: "provider-codex", turnId: activeTurn, questions: [] },
							}),
						);
				} else if (!["busy", "normal-interrupt"].includes(behavior!)) complete("completed");
			}
		}),
	);
	server.listen(args[args.indexOf("--listen") + 1]!.replace("unix://", ""));
} else {
	const path = args[args.indexOf("--remote") + 1]!.replace("unix://", "");
	const socket = new WebSocket(`ws+unix://${path}:/`, { perMessageDeflate: false });
	let id = 0;
	let questionId: number | undefined;
	const send = (prompt: string) =>
		socket.send(
			JSON.stringify({
				id: ++id,
				method: "turn/start",
				params: { threadId: "provider-codex", input: [{ type: "text", text: prompt }] },
			}),
		);
	socket.once("open", () => {
		process.stdout.write("fixture response\n");
		if (behavior === "terminal-exit") process.exit(0);
	});
	socket.on("message", (bytes) => {
		const event = JSON.parse(bytes.toString());
		if (event.method === "turn/completed") process.stdout.write("fixture response\n");
		if (event.method === "item/tool/requestUserInput") {
			questionId = event.id;
			process.stdout.write("question shown\n");
		}
	});
	process.stdin.setRawMode(true);
	process.stdin.resume();
	let text = "";
	process.stdin.on("data", (chunk) => {
		text += chunk.toString().replaceAll("\x1b[200~", "").replaceAll("\x1b[201~", "");
		if (text.endsWith("\r")) {
			if (questionId !== undefined) {
				socket.send(JSON.stringify({ id: questionId, result: { answers: {} } }));
				questionId = undefined;
			} else send(text.slice(0, -1));
			text = "";
		}
	});
}
