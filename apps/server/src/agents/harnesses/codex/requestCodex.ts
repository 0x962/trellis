import { request } from "node:http";
export function requestCodex(
	socket: string,
	token: string,
	path: "/prompt" | "/interrupt",
	body: { sessionId: string; prompt?: string; turnId?: string },
) {
	return new Promise<void>((resolve, reject) => {
		const req = request(
			{
				socketPath: socket,
				path,
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			},
			(response) => {
				let text = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					text += chunk;
				});
				response.on("error", reject);
				response.on("end", () =>
					response.statusCode === 200 ? resolve() : reject(new Error(`Codex control failed: ${text}`)),
				);
			},
		);
		req.on("error", reject);
		req.setTimeout(10000, () => req.destroy(new Error("Codex control response is unknown: request timed out")));
		req.end(JSON.stringify(body));
	});
}
