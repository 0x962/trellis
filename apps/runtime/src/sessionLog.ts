import {
	appendFileSync,
	closeSync,
	createWriteStream,
	existsSync,
	openSync,
	readFileSync,
	readSync,
	statSync,
	type WriteStream,
} from "node:fs";
import type { RuntimeOutput } from "@trellis/runtime-protocol";
import { SessionOutputBuffer } from "./sessionOutputBuffer";

export class SessionLog {
	private readonly startOffset: number;
	private readonly legacy: Buffer;
	private readonly bytesPath: string;
	private readonly listeners = new Set<() => void>();
	private readonly drainListeners = new Set<() => void>();
	private readonly buffer?: SessionOutputBuffer;
	private writer?: WriteStream;
	private waitingForDisk = false;
	private committedLength: number;
	private length: number;
	constructor(path: string, buffered = false) {
		const stored = existsSync(path)
			? (JSON.parse(readFileSync(path, "utf8")) as { offset: number; data: string })
			: { offset: 0, data: "" };
		this.startOffset = stored.offset;
		this.legacy = Buffer.from(stored.data, "base64");
		this.bytesPath = `${path}.bytes`;
		appendFileSync(this.bytesPath, Buffer.alloc(0), { mode: 0o600 });
		this.length = this.legacy.length + statSync(this.bytesPath).size;
		this.committedLength = this.length;
		if (buffered) this.buffer = new SessionOutputBuffer(this.startOffset + this.length);
	}
	append(bytes: Buffer) {
		this.length += bytes.length;
		if (this.buffer) {
			this.buffer.append(bytes);
			if (!this.writer) {
				this.writer = createWriteStream(this.bytesPath, { flags: "a", mode: 0o600, highWaterMark: 256 * 1024 });
				this.writer.on("drain", () => {
					for (const listener of this.drainListeners) listener();
				});
			}
			this.writer.write(bytes, (error) => {
				if (error) throw error;
				this.committedLength += bytes.length;
				if (this.waitingForDisk) {
					this.waitingForDisk = false;
					this.notify();
				}
			});
		} else {
			appendFileSync(this.bytesPath, bytes);
			this.committedLength = this.length;
		}
		this.notify();
		return this.writable;
	}
	private notify() {
		for (const listener of this.listeners) listener();
	}
	get writable() {
		return !this.writer?.writableNeedDrain;
	}
	get complete() {
		return this.writer === undefined || this.writer.writableFinished;
	}
	onDrain(listener: () => void) {
		this.drainListeners.add(listener);
	}
	async finish() {
		if (this.writer) await new Promise<void>((resolve) => this.writer!.end(resolve));
		this.buffer?.clear();
		this.drainListeners.clear();
	}
	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	read(offset: number, maxBytes = 65536): RuntimeOutput {
		const output = this.readBytes(offset, maxBytes);
		return { ...output, data: output.data.toString("base64") };
	}
	readBytes(offset: number, maxBytes = 65536) {
		const startOffset = Math.min(Math.max(offset, this.startOffset), this.startOffset + this.length);
		const local = startOffset - this.startOffset;
		if (this.buffer && startOffset >= this.buffer.start) {
			const data = this.buffer.read(startOffset, Math.min(maxBytes, this.length - local));
			return { data, startOffset, nextOffset: startOffset + data.length, truncated: offset < this.startOffset };
		}
		// Bytes outside the memory buffer become readable after their ordered file write completes.
		const size = Math.max(0, Math.min(maxBytes, this.committedLength - local));
		if (size === 0 && local < this.length) this.waitingForDisk = true;
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
			data: bytes,
			startOffset,
			nextOffset: startOffset + size,
			truncated: offset < this.startOffset,
		};
	}
}
