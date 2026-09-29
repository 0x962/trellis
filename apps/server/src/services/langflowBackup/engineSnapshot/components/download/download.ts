import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

export async function download(input: {
	url: URL;
	token: string;
	path: string;
	expected: { sha256: string; size: number };
	signal: AbortSignal;
}) {
	const response = await fetch(input.url, {
		headers: { Authorization: `Bearer ${input.token}` },
		redirect: "error",
		signal: input.signal,
	});
	if (!response.ok || !response.body) throw new Error("engine_snapshot_download_failed");
	const file = await open(input.path, "wx", 0o600);
	const hash = createHash("sha256");
	let size = 0;
	try {
		for await (const chunk of response.body) {
			hash.update(chunk);
			size += chunk.byteLength;
			await file.writeFile(chunk);
		}
		if (size !== input.expected.size || hash.digest("hex") !== input.expected.sha256) {
			throw new Error("engine_snapshot_digest_conflict");
		}
		await file.sync();
	} finally {
		await file.close();
	}
}
