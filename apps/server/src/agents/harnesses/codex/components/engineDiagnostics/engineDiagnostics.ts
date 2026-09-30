import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// The native terminal owns the screen. Engine diagnostics stay in the attempt
// log, while structured entries can report compaction progress to Trellis.
export async function recordEngineDiagnostics(
	input: Readable,
	path: string,
	onEntry: (entry: unknown) => void,
): Promise<void> {
	const log = createWriteStream(path, { flags: "a", mode: 0o600 });
	const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	lines.on("line", (line) => {
		if (!line.startsWith("{")) return;
		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			return;
		}
		onEntry(entry);
	});
	lines.on("error", (error) => log.destroy(error));
	try {
		await pipeline(input, log);
	} finally {
		lines.close();
	}
}
