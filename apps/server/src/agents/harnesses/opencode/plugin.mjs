import { spawn } from "node:child_process";

export const TrellisPlugin = async ({ client }) => {
	let sessionId = process.env.TRELLIS_PROVIDER_SESSION || null;
	let turnId;
	let agent;
	let outcome = "completed";
	const parts = new Map();
	const children = new Set();
	let pending = Promise.resolve();
	const send = (event) => {
		pending = pending.then(
			() =>
				new Promise((resolve, reject) => {
					const child = spawn("/bin/zsh", ["-f", "-c", process.env.TRELLIS_HARNESS_HOOK], {
						stdio: ["pipe", "ignore", "pipe"],
					});
					let error = "";
					child.stderr.on("data", (data) => {
						error += data;
					});
					child.once("error", reject);
					child.once("exit", (code) =>
						code === 0 ? resolve() : reject(new Error(`Trellis hook exited ${code}: ${error}`)),
					);
					child.stdin.end(JSON.stringify({ harness: "opencode", ...event }));
				}),
		);
		return pending;
	};
	const matches = (id) => id === sessionId;
	return {
		config: async (config) => {
			config.permission = { "*": "allow" };
			for (const agent of Object.values(config.agent ?? {})) agent.permission = { "*": "allow" };
		},
		"chat.message": async (input, output) => {
			if (children.has(input.sessionID)) return;
			if (sessionId !== input.sessionID) {
				const found = await client.session.get({ path: { id: input.sessionID } });
				if (found.error) throw new Error(JSON.stringify(found.error));
				if (found.data.parentID) {
					children.add(input.sessionID);
					return;
				}
			}
			sessionId = input.sessionID;
			turnId = output.message.id;
			agent = output.message.agent;
			parts.clear();
			outcome = "completed";
			await send({
				event: "prompt",
				sessionId,
				turnId,
				prompt: output.parts
					.filter((p) => p.type === "text")
					.map((p) => p.text)
					.join("\n"),
				...(input.model ? { model: `${input.model.providerID}/${input.model.modelID}` } : {}),
			});
		},
		"chat.params": async (input) => {
			if (matches(input.sessionID) && input.agent === agent && input.message.id === turnId)
				await send({ event: "session", sessionId, turnId, model: `${input.provider.id}/${input.model.id}` });
		},
		"tool.execute.before": async (input, output) => {
			if (matches(input.sessionID))
				await send({
					event: "tool-start",
					sessionId,
					turnId,
					tool: { id: input.callID, name: input.tool, input: output.args },
				});
		},
		"tool.execute.after": async (input, output) => {
			if (matches(input.sessionID))
				await send({
					event: "tool-end",
					sessionId,
					turnId,
					tool: { id: input.callID, name: input.tool, output: output.output },
				});
		},
		"experimental.text.complete": async (input, output) => {
			if (matches(input.sessionID)) parts.set(input.partID, output.text);
		},
		event: async ({ event }) => {
			const p = event.properties;
			if (event.type === "session.created") {
				if (p.info.parentID) {
					children.add(p.info.id);
					return;
				}
				if (sessionId === null) {
					sessionId = p.info.id;
					await send({ event: "session", sessionId });
				}
				return;
			}
			if (event.type === "message.part.updated") {
				const part = p.part;
				if (matches(part.sessionID) && part.type === "tool" && part.state.status === "running")
					await send({
						event: "tool-update",
						sessionId,
						turnId,
						tool: { id: part.callID, name: part.tool, input: part.state.input, output: part.state.metadata },
					});
				return;
			}
			if (!matches(p.sessionID)) return;
			if (event.type === "session.error") {
				outcome = p.error?.name === "MessageAbortedError" ? "interrupted" : "failed";
				if (outcome === "failed")
					await send({ event: "error", sessionId, turnId, error: JSON.stringify(p.error), outcome });
			}
			if (event.type === "session.status") {
				if (p.status.type === "busy") await send({ event: "working", sessionId, turnId });
				if (p.status.type === "idle")
					await send({ event: "idle", sessionId, turnId, result: [...parts.values()].join("\n"), outcome });
			}
		},
	};
};
