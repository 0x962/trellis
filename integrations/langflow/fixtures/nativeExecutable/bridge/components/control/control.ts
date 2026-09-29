import { chmod } from "node:fs/promises";
import { createServer } from "node:http";
import { z } from "zod";

const BodySchema = z.strictObject({
	sessionId: z.string(),
	prompt: z.string().optional(),
	turnId: z.string().optional(),
});

export async function startControl(input: {
	socket: string;
	token: string;
	sessionId: string;
	turns: {
		current: () => string | null;
		prompt: (text: string) => Promise<void>;
		interrupt: (turn: string) => Promise<void>;
	};
}) {
	let pending = false;
	let failed = false;
	const server = createServer(async (request, response) => {
		const reply = (status: number, body: unknown) => {
			response.writeHead(status, { "content-type": "application/json" });
			response.end(JSON.stringify(body));
		};
		if (request.headers.authorization !== `Bearer ${input.token}`) return reply(401, { error: "Unauthorized" });
		if (request.method !== "POST" || !["/prompt", "/interrupt"].includes(request.url!))
			return reply(404, { error: "Not found" });
		if (failed) return reply(503, { error: "Retain the failed attempt before another launch" });
		if (pending) return reply(409, { error: "CONTROL_PENDING" });
		pending = true;
		try {
			request.setEncoding("utf8");
			let body = "";
			for await (const chunk of request) body += chunk;
			const parsed = BodySchema.safeParse(JSON.parse(body));
			if (!parsed.success) return reply(400, { error: "Invalid control input" });
			const value = parsed.data;
			if (value.sessionId !== input.sessionId) return reply(409, { error: "STALE_SESSION" });
			if (request.url === "/interrupt") {
				if (!value.turnId || value.turnId !== input.turns.current()) return reply(409, { error: "STALE_TURN" });
				await input.turns.interrupt(value.turnId);
			} else {
				if (!value.prompt) return reply(400, { error: "Missing prompt" });
				if (input.turns.current() !== null) return reply(409, { error: "CONTROL_PENDING" });
				await input.turns.prompt(value.prompt);
			}
			reply(200, { accepted: true, sessionId: input.sessionId });
		} catch {
			failed = true;
			reply(500, { error: "Fixture control failed; retain the runtime receipt before any new request" });
		} finally {
			pending = false;
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(input.socket, resolve);
	});
	await chmod(input.socket, 0o600);
	return server;
}
