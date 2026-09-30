import { gzipSync } from "node:zlib";

type Entry = { path: string; type?: string; body?: Buffer; link?: string; mode?: number };

export function pairedTarFixture(entries: Entry[]) {
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const body = entry.body ?? Buffer.alloc(0);
		const header = Buffer.alloc(512);
		header.write(entry.path, 0, 100, "utf8");
		for (const [offset, length, value] of [[100, 8, entry.mode ?? 0o600], [108, 8, 0], [116, 8, 0], [124, 12, body.length], [136, 12, 0]])
			header.write(`${value!.toString(8).padStart(length! - 1, "0")}\0`, offset!, length!, "ascii");
		header.fill(32, 148, 156);
		header.write(entry.type ?? "0", 156, 1, "ascii");
		if (entry.link) header.write(entry.link, 157, 100, "utf8");
		header.write("ustar\0", 257, 6, "ascii");
		header.write("00", 263, 2, "ascii");
		const checksum = header.reduce((sum, byte) => sum + byte, 0);
		header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
		blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
	}
	blocks.push(Buffer.alloc(1024));
	return gzipSync(Buffer.concat(blocks));
}
