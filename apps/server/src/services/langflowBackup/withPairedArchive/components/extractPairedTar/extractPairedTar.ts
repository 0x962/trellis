import { mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { manifestName, snapshotRoots } from "../../../manifest";
import { pairedPaxHeader } from "./components/pairedPaxHeader";
import { pairedTarHeader } from "./components/pairedTarHeader";
import { PairedTarReader } from "./components/pairedTarReader";

export async function extractPairedTar(source: AsyncIterable<Buffer>, directory: string, signal: AbortSignal) {
	const reader = new PairedTarReader(source, signal);
	const seen = new Map<string, string>();
	let extended: { path?: string; size?: number } | undefined;
	for (;;) {
		const bytes = await reader.bytes(512);
		if (bytes.every((value) => value === 0)) {
			if (extended) throw new Error("paired_archive_unbound_extension");
			if ((await reader.bytes(512)).some((value) => value !== 0)) throw new Error("paired_archive_invalid_end");
			for (;;) {
				const tail = await reader.take(512);
				if (tail === null) return;
				if (tail.some((value) => value !== 0)) throw new Error("paired_archive_trailing_data");
			}
		}
		const header = pairedTarHeader(bytes, extended?.path);
		if (header.type === "x" || header.type === "L") {
			if (extended) throw new Error("paired_archive_duplicate_extension");
			const data = await reader.bytes(header.size);
			await reader.padding(header.size);
			if (header.type === "x") extended = pairedPaxHeader(data);
			else {
				if (data.at(-1) !== 0) throw new Error("paired_archive_invalid_long_path");
				extended = { path: new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(0, -1)) };
			}
			continue;
		}
		if (!["0", "5"].includes(header.type) || header.link !== "" || (header.mode & ~0o777) !== 0)
			throw new Error("paired_archive_unsupported_entry");
		const name = extended?.path ?? header.path;
		const path = header.type === "5" && name.endsWith("/") ? name.slice(0, -1) : name;
		const size = extended?.size ?? header.size;
		extended = undefined;
		if (path.includes("\\") || path.includes("\0") || path.split("/").some((part) => ["", ".", ".."].includes(part)))
			throw new Error("paired_archive_unsafe_path");
		if (path !== manifestName && !snapshotRoots.some((root) => path === root || path.startsWith(`${root}/`)))
			throw new Error("paired_archive_unsupported_root");
		if (seen.has(path)) throw new Error("paired_archive_duplicate_entry");
		if (dirname(path) !== "." && seen.get(dirname(path)) !== "5") throw new Error("paired_archive_missing_parent");
		seen.set(path, header.type);
		if (header.type === "5") {
			if (path === manifestName || size !== 0) throw new Error("paired_archive_invalid_directory");
			await mkdir(join(directory, path), { mode: 0o700 });
		} else {
			if (snapshotRoots.some((root) => path === root)) throw new Error("paired_archive_invalid_root");
			const file = await open(join(directory, path), "wx", (header.mode & 0o111) !== 0 ? 0o700 : 0o600);
			try {
				let remaining = size;
				while (remaining > 0) {
					const chunk = await reader.take(remaining);
					if (chunk === null) throw new Error("paired_archive_truncated");
					await file.writeFile(chunk, { signal });
					remaining -= chunk.length;
				}
				await file.sync();
			} finally { await file.close(); }
			await reader.padding(size);
		}
	}
}
