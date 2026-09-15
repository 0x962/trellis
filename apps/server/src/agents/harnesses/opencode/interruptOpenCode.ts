import { request } from "node:http";

export function interruptOpenCode(socket: string, token: string, sessionId: string, turnId: string) {
	return requestOpenCode(socket, token, "/interrupt", { sessionId, turnId }) as Promise<{
		accepted: true;
		sessionId: string;
		turnId: string;
	}>;
}
export function sendOpenCode(socket: string, token: string, sessionId: string, prompt: string) {
	return requestOpenCode(socket, token, "/prompt", { sessionId, prompt }) as Promise<{
		accepted: true;
		sessionId: string;
	}>;
}
function requestOpenCode(socket: string, token: string, path: string, body: unknown) {
	return new Promise<{ accepted: true; sessionId: string; turnId: string }>((resolve, reject) => {
		const req = request(
			{
				socketPath: socket,
				path,
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			},
			(response) => {
				let body = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("error", reject);
				response.on("end", () => {
					if (response.statusCode !== 200) return reject(new Error(`OpenCode control failed: ${body}`));
					try {
						resolve(JSON.parse(body));
					} catch (error) {
						reject(error);
					}
				});
			},
		);
		req.on("error", reject);
		req.setTimeout(10000, () => req.destroy(new Error("OpenCode control timed out")));
		req.end(JSON.stringify(body));
	});
}
