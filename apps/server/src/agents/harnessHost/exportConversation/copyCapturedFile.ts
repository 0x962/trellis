import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import type { CapturedConversationFile, ConversationAdapter } from "../../harnesses/conversationExport/types";

export async function copyCapturedFile(input: {
	source: AsyncIterable<Uint8Array>;
	target: string;
	file: CapturedConversationFile;
	transcript: boolean;
	adapter: ConversationAdapter;
	sessionId: string;
	signal: AbortSignal;
}) {
	const output = await open(input.target, "wx", 0o600);
	const digest = createHash("sha256");
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let bytes = 0;
	let pending = "";
	let matched = false;
	function record(text: string) {
		if (text.trim() === "") return;
		const parsed = JSON.parse(text);
		const identity = input.adapter.identifies(parsed, input.sessionId);
		if (identity === "other") throw new Error("conversation_session_conflict");
		if (identity === "match") matched = true;
	}
	function consume(text: string) {
		pending += text;
		if (input.adapter.encoding !== "jsonl") return;
		let end = pending.indexOf("\n");
		while (end !== -1) {
			record(pending.slice(0, end));
			pending = pending.slice(end + 1);
			end = pending.indexOf("\n");
		}
	}
	try {
		for await (const chunk of input.source) {
			input.signal.throwIfAborted();
			digest.update(chunk);
			bytes += chunk.byteLength;
			await output.writeFile(chunk);
			if (input.transcript) consume(decoder.decode(chunk, { stream: true }));
		}
		input.signal.throwIfAborted();
		if (input.transcript) {
			consume(decoder.decode());
			record(pending);
			if (!matched) throw new Error("conversation_format_or_identity_unavailable");
		}
		const sha256 = digest.digest("hex");
		if (sha256 !== input.file.sha256 || bytes !== input.file.bytes) throw new Error("conversation_capture_bytes_conflict");
		await output.sync();
		return { bytes, sha256 };
	} finally {
		await output.close();
	}
}
