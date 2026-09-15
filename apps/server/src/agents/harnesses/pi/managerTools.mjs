import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export async function registerManagerTools(pi, launch) {
	const child = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "inherit"] });
	const waiting = new Map();
	let sequence = 0;
	let failure = null;
	const fail = (error) => {
		failure = error;
		for (const pending of waiting.values()) pending.reject(error);
		waiting.clear();
	};
	child.once("error", fail);
	child.once("exit", (code) => fail(new Error(`The Trellis tool bridge exited (${code}).`)));
	child.stdin.on("error", fail);
	const lines = createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		try {
			const message = JSON.parse(line);
			if (message.id === undefined) return;
			const pending = waiting.get(message.id);
			if (!pending) return;
			waiting.delete(message.id);
			if (message.error) pending.reject(new Error(message.error.message));
			else pending.resolve(message.result);
		} catch (error) {
			fail(error);
		}
	});
	const request = (method, params) => {
		if (failure) return Promise.reject(failure);
		return new Promise((resolve, reject) => {
			const id = ++sequence;
			waiting.set(id, { resolve, reject });
			child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
		});
	};
	const close = () => {
		lines.close();
		child.stdin.end();
		child.kill();
	};
	try {
		await request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "trellis-pi-manager", version: "1" },
		});
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
		const { tools } = await request("tools/list", {});
		const names = tools.map((tool) => tool.name);
		for (const tool of tools)
			pi.registerTool({
				name: tool.name,
				label: tool.name,
				description: tool.description,
				promptSnippet: tool.description,
				parameters: tool.inputSchema,
				async execute(_id, args, signal) {
					signal?.throwIfAborted();
					const result = await request("tools/call", { name: tool.name, arguments: args });
					if (result.isError) throw new Error(result.content.map((part) => part.text ?? "").join("\n"));
					return { content: result.content, details: {} };
				},
			});
		pi.on("session_start", () => pi.setActiveTools(names));
		pi.on("tool_call", (event) => {
			if (!names.includes(event.toolName))
				return { block: true, reason: "This tool is unavailable in the manager tool catalog." };
		});
		pi.on("session_shutdown", close);
	} catch (error) {
		close();
		throw error;
	}
}
