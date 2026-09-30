export class PairedTarReader {
	private chunk: Buffer = Buffer.alloc(0);
	private offset = 0;
	private readonly iterator: AsyncIterator<Buffer>;

	constructor(source: AsyncIterable<Buffer>, private readonly signal: AbortSignal) {
		this.iterator = source[Symbol.asyncIterator]();
	}

	async take(maximum: number): Promise<Buffer | null> {
		this.signal.throwIfAborted();
		while (this.offset === this.chunk.length) {
			const next = await this.iterator.next();
			this.signal.throwIfAborted();
			if (next.done) return null;
			this.chunk = next.value;
			this.offset = 0;
		}
		const end = Math.min(this.chunk.length, this.offset + maximum);
		const bytes = this.chunk.subarray(this.offset, end);
		this.offset = end;
		return bytes;
	}

	async bytes(size: number) {
		const parts: Buffer[] = [];
		let remaining = size;
		while (remaining > 0) {
			const bytes = await this.take(remaining);
			if (bytes === null) throw new Error("paired_archive_truncated");
			parts.push(bytes);
			remaining -= bytes.length;
		}
		return Buffer.concat(parts, size);
	}

	async padding(size: number) {
		const bytes = await this.bytes((512 - size % 512) % 512);
		if (bytes.some((value) => value !== 0)) throw new Error("paired_archive_invalid_padding");
	}
}
