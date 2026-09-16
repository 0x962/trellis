import { chmod } from "node:fs/promises";
import { createServer } from "node:http";

export async function openCodeControl({ socket, token, current, abort, prompt }) {
	let pending;
	let interrupted;
	const server = createServer(async (request, response) => {
		const reply = (status, body) => {
			response.writeHead(status, { "content-type": "application/json" });
			response.end(JSON.stringify(body));
		};
		if (request.headers.authorization !== `Bearer ${token}`) return reply(401, { error: "Unauthorized" });
		if (request.method !== "POST" || !["/interrupt", "/prompt"].includes(request.url))
			return reply(404, { error: "Not found" });
		try {
			let body = "";
			for await (const chunk of request) {
				body += chunk;
				if (body.length > 1048576) return reply(413, { error: "Request too large" });
			}
			const input = JSON.parse(body);
			const active = current();
			if (request.url === "/prompt") {
				if (typeof input.sessionId !== "string" || typeof input.prompt !== "string")
					return reply(400, { error: "Session ID and prompt are required" });
				if (input.sessionId !== active.sessionId) return reply(409, { error: "STALE_SESSION" });
				if (pending) return reply(409, { error: "CONTROL_PENDING" });
				const result = await prompt(input.sessionId, input.prompt);
				if (result.error || result.response.status !== 204)
					return reply(502, { error: JSON.stringify(result.error ?? "OpenCode did not acknowledge prompt") });
				return reply(200, { accepted: true, sessionId: input.sessionId });
			}
			if (typeof input.sessionId !== "string" || typeof input.turnId !== "string")
				return reply(400, { error: "Session and turn IDs are required" });
			if (input.sessionId !== active.sessionId || input.turnId !== active.turnId || !active.working)
				return reply(409, { error: "STALE_TURN" });
			if (pending) return reply(409, { error: "INTERRUPT_PENDING" });
			const key = JSON.stringify([input.sessionId, input.turnId]);
			if (interrupted === key) return reply(409, { error: "INTERRUPT_ALREADY_REQUESTED" });
			interrupted = key;
			const operation = abort(input.sessionId);
			pending = operation;
			let result;
			try {
				result = await operation;
			} finally {
				if (pending === operation) pending = undefined;
			}
			if (result.error || result.data !== true)
				return reply(502, { error: JSON.stringify(result.error ?? "OpenCode did not acknowledge abort") });
			reply(200, { accepted: true, sessionId: input.sessionId, turnId: input.turnId });
		} catch (error) {
			reply(500, { error: error.message });
		}
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(socket, resolve);
	});
	await chmod(socket, 0o600);
	server.unref();
	return {
		beforePrompt: async () => {
			if (pending) await pending;
		},
		close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
	};
}
