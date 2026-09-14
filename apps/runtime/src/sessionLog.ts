import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { RuntimeOutput } from "@trellis/runtime-protocol";

export class SessionLog {
	private startOffset = 0;
	private bytes = Buffer.alloc(0);
	constructor(
		private readonly path: string,
		private readonly limit = 1024 * 1024,
	) {
		if (existsSync(path)) {
			const stored = JSON.parse(readFileSync(path, "utf8")) as { offset: number; data: string };
			this.startOffset = stored.offset;
			this.bytes = Buffer.from(stored.data, "base64");
		}
	}
	append(bytes: Buffer) {
		this.bytes = Buffer.concat([this.bytes, bytes]);
		if (this.bytes.length > this.limit) {
			const excess = this.bytes.length - this.limit;
			this.bytes = this.bytes.subarray(excess);
			this.startOffset += excess;
		}
		const tmp = `${this.path}.tmp`;
		writeFileSync(tmp, JSON.stringify({ offset: this.startOffset, data: this.bytes.toString("base64") }), {
			mode: 0o600,
		});
		renameSync(tmp, this.path);
	}
	read(offset: number): RuntimeOutput {
		const startOffset = Math.max(offset, this.startOffset);
		const nextOffset = this.startOffset + this.bytes.length;
		return {
			data: this.bytes.subarray(Math.min(startOffset - this.startOffset, this.bytes.length)).toString("base64"),
			startOffset: Math.min(startOffset, nextOffset),
			nextOffset,
			truncated: offset < this.startOffset,
		};
	}
}
