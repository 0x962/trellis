import { open } from "node:fs/promises";
import { z } from "zod";

const assistant = z.object({
	timestamp: z.string(),
	message: z.object({ content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })) }),
});

export async function readClaudeMessage(path: string, sessionId: string) {
	const file = await open(path, "r");
	try {
		let position = (await file.stat()).size;
		let pending = Buffer.alloc(0);
		let skipTail = true;
		while (position > 0) {
			const size = Math.min(position, 65536);
			position -= size;
			const chunk = Buffer.alloc(size);
			await file.read(chunk, 0, size, position);
			pending = Buffer.concat([chunk, pending]);
			let end = pending.length;
			while (end > 0) {
				const separator = pending.lastIndexOf(10, end - 1);
				if (separator === -1 && position > 0) break;
				const line = pending.subarray(separator + 1, end).toString("utf8");
				end = Math.max(separator, 0);
				if (skipTail) {
					skipTail = false;
					continue;
				}
				if (line === "") continue;
				const row = JSON.parse(line);
				if (row.type !== "assistant" || row.sessionId !== sessionId) continue;
				const text = assistant.shape.message
					.parse(row.message)
					.content.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("\n");
				if (text !== "") return { text, at: assistant.shape.timestamp.parse(row.timestamp) };
			}
			pending = pending.subarray(0, end);
		}
		return null;
	} finally {
		await file.close();
	}
}
