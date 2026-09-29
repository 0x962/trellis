import { createHash } from "node:crypto";
import { runGit } from "./gitProcess.ts";

const utf8End = (bytes: Buffer, limit: number) => {
	let end = Math.min(bytes.length, limit);
	while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
	return end;
};

export const gitTextPage = (
	workspace: string,
	args: string[],
	page: { offset: number; limit: number },
	signal?: AbortSignal,
) =>
	runGit(workspace, args, signal, async (stream) => {
		const hash = createHash("sha256");
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		for await (const chunk of stream) {
			hash.update(chunk);
			const start = Math.max(page.offset, totalBytes);
			const end = Math.min(page.offset + page.limit + 3, totalBytes + chunk.byteLength);
			if (start < end) chunks.push(chunk.subarray(start - totalBytes, end - totalBytes));
			totalBytes += chunk.byteLength;
		}
		const bytes = Buffer.concat(chunks);
		const end = utf8End(bytes, page.limit);
		const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, end));
		return {
			text,
			nextOffset: page.offset + end,
			totalBytes,
			digest: hash.digest("hex"),
			validOffset: bytes.length === 0 || (bytes[0]! & 0xc0) !== 0x80,
		};
	});
