import { chmod } from "node:fs/promises";
import { createServer } from "node:http";
import { z } from "zod";
import type { MspClient } from "./mspClient.ts";
import { uuid7 } from "./uuid7.ts";

// The private control socket of one Muse bridge. The host sends a follow-up
// prompt or an interrupt here. An interrupt becomes a Muse command on the
// session the bridge owns. A prompt goes to `submit`, which starts a turn
// when the session is idle and holds the prompt until the running turn
// ends otherwise.
export async function museControl(input: {
	socket: string;
	token: string;
	sessionId: string;
	client: MspClient;
	current: () => { turnId: string | null; working: boolean };
	submit: (prompt: string) => Promise<void>;
}) {
	let pending = false;
	let interrupted: string | null = null;
	const server = createServer(async (request, response) => {
		const reply = (status: number, body: unknown) => {
			response.writeHead(status, { "content-type": "application/json" });
			response.end(JSON.stringify(body));
		};
		if (request.headers.authorization !== `Bearer ${input.token}`) return reply(401, { error: "Unauthorized" });
		if (request.method !== "POST" || !["/prompt", "/interrupt"].includes(request.url!))
			return reply(404, { error: "Not found" });
		let ownsPending = false;
		try {
			let body = "";
			for await (const chunk of request) {
				body += chunk;
				if (body.length > 1048576) return reply(413, { error: "Request too large" });
			}
			const value = z
				.object({ sessionId: z.string(), prompt: z.string().optional(), turnId: z.string().optional() })
				.parse(JSON.parse(body));
			if (value.sessionId !== input.sessionId) return reply(409, { error: "STALE_SESSION" });
			const current = input.current();
			if (pending) return reply(409, { error: "CONTROL_PENDING" });
			if (request.url === "/interrupt") {
				if (!current.working || value.turnId !== current.turnId || value.turnId === interrupted)
					return reply(409, { error: "STALE_TURN" });
				pending = true;
				ownsPending = true;
				interrupted = value.turnId!;
				await input.client.request("turn/interrupt", {
					commandId: uuid7(),
					sessionId: input.sessionId,
					turnId: value.turnId,
				});
			} else {
				const prompt = z.string().min(1).parse(value.prompt);
				pending = true;
				ownsPending = true;
				await input.submit(prompt);
			}
			reply(200, { accepted: true, sessionId: input.sessionId });
		} catch (error) {
			reply(500, { error: (error as Error).message });
		} finally {
			if (ownsPending) pending = false;
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(input.socket, resolve);
	});
	await chmod(input.socket, 0o600);
	return server;
}
