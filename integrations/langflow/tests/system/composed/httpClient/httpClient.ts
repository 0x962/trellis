import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BatchInput } from "../batchInput";

export function httpClient(input: BatchInput, token: string, directory: string) {
	let sequence = 0;
	return async (method: "GET" | "POST", path: string, body?: unknown) => {
		const remaining = Date.parse(input.deadlineAt) - Date.now();
		if (remaining <= 0) throw new Error("batch_deadline_elapsed");
		const file = join(directory, `${String(++sequence).padStart(6, "0")}.json`);
		const request = { method, path, body: body ?? null, requestedAt: new Date().toISOString() };
		await writeFile(file, JSON.stringify({ request, outcome: "pending" }), { mode: 0o600, flag: "wx" });
		let response: Response;
		let text: string;
		try {
			response = await fetch(`${input.apiOrigin}/api${path}`, {
				method,
				redirect: "error",
				headers: {
					authorization: `Bearer ${token}`,
					"x-trellis-actor": input.actor,
					"content-type": "application/json",
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(Math.min(remaining, input.requestTimeoutMs, 2_147_483_647)),
			});
			text = await response.text();
		} catch {
			await writeFile(file, JSON.stringify({ request, outcome: "transport_unknown" }), { mode: 0o600 });
			throw new Error(`http_transport_unknown:${sequence}`);
		}
		await writeFile(file, JSON.stringify({
			request,
			outcome: "response",
			status: response.status,
			body: text,
			receivedAt: new Date().toISOString(),
		}), { mode: 0o600 });
		if (!response.ok) throw new Error(`http_response_failed:${sequence}:${response.status}`);
		return JSON.parse(text) as unknown;
	};
}
