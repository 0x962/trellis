import { request } from "node:http";
import type { InputAnswer } from "@trellis/api";
import { controlReplyText } from "../controlReplyText/controlReplyText.ts";

export function requestMuse(
	socket: string,
	token: string,
	path: "/prompt" | "/interrupt" | "/answer",
	body: {
		sessionId: string;
		prompt?: string;
		turnId?: string;
		requestId?: string;
		answers?: InputAnswer[];
		cancel?: boolean;
	},
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
				response.on("end", () => {
					if (response.statusCode === 200) return resolve();
					const reply = controlReplyText("muse", response.statusCode!, text);
					reject(Object.assign(new Error(reply.message), { code: reply.code }));
				});
			},
		);
		req.on("error", reject);
		req.setTimeout(10000, () => req.destroy(new Error("Muse control response is unknown: request timed out")));
		req.end(JSON.stringify(body));
	});
}
