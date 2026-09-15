import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import type { RuntimeOutput } from "@trellis/runtime-protocol";

export class SessionLog {
	private readonly startOffset: number;
	private readonly legacy: Buffer;
	private readonly bytesPath: string;
	private readonly listeners = new Set<() => void>();
	private length: number;
	constructor(path: string) {
		const stored = existsSync(path)
			? (JSON.parse(readFileSync(path, "utf8")) as { offset: number; data: string })
			: { offset: 0, data: "" };
		this.startOffset = stored.offset;
		this.legacy = Buffer.from(stored.data, "base64");
		this.bytesPath = `${path}.bytes`;
		appendFileSync(this.bytesPath, Buffer.alloc(0), { mode: 0o600 });
		this.length = this.legacy.length + statSync(this.bytesPath).size;
	}
	append(bytes: Buffer) {
		appendFileSync(this.bytesPath, bytes);
		this.length += bytes.length;
		for (const listener of this.listeners) listener();
	}
	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	read(offset: number, maxBytes = 65536): RuntimeOutput {
		const startOffset = Math.min(Math.max(offset, this.startOffset), this.startOffset + this.length);
		const local = startOffset - this.startOffset;
		const size = Math.min(maxBytes, this.length - local);
		const bytes = Buffer.alloc(size);
		const legacySize = Math.min(size, Math.max(0, this.legacy.length - local));
		if (legacySize > 0) this.legacy.copy(bytes, 0, local, local + legacySize);
		if (size > legacySize) {
			const descriptor = openSync(this.bytesPath, "r");
			try {
				readSync(descriptor, bytes, legacySize, size - legacySize, Math.max(0, local - this.legacy.length));
			} finally {
				closeSync(descriptor);
			}
		}
		return {
			data: bytes.toString("base64"),
			startOffset,
			nextOffset: startOffset + size,
			truncated: offset < this.startOffset,
		};
	}
}
