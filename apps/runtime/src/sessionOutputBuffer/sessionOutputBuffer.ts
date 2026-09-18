const pageSize = 65536;
const pageLimit = 16;

export class SessionOutputBuffer {
	private readonly pages: { bytes: Buffer; start: number; used: number }[] = [];
	constructor(private end: number) {}
	get start() {
		return this.pages[0]?.start ?? this.end;
	}
	append(bytes: Buffer) {
		let offset = 0;
		while (offset < bytes.length) {
			let page = this.pages.at(-1);
			if (!page || page.used === pageSize) {
				page = { bytes: Buffer.allocUnsafe(pageSize), start: this.end, used: 0 };
				this.pages.push(page);
				if (this.pages.length > pageLimit) this.pages.shift();
			}
			const size = Math.min(bytes.length - offset, pageSize - page.used);
			bytes.copy(page.bytes, page.used, offset, offset + size);
			page.used += size;
			offset += size;
			this.end += size;
		}
	}
	read(offset: number, size: number) {
		const chunks: Buffer[] = [];
		for (const page of this.pages) {
			if (offset >= page.start + page.used) continue;
			const start = offset - page.start;
			const length = Math.min(size, page.used - start);
			chunks.push(page.bytes.subarray(start, start + length));
			offset += length;
			size -= length;
			if (!size) break;
		}
		return chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks);
	}
	clear() {
		this.pages.length = 0;
	}
}
