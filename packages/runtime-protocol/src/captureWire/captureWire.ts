import type { RuntimeCaptureFrame } from "../capture.ts";

const kinds = {
	binding: 1,
	inventory: 2,
	"inventory-result": 3,
	read: 4,
	data: 5,
	end: 6,
	seal: 7,
	receipt: 8,
	release: 9,
	released: 10,
	error: 11,
} as const;

const names = Object.fromEntries(Object.entries(kinds).map(([name, kind]) => [kind, name])) as Record<
	number,
	RuntimeCaptureFrame["type"]
>;

const allocate = (kind: number, length: number) => {
	const bytes = Buffer.allocUnsafe(5 + length);
	bytes.writeUInt32BE(1 + length, 0);
	bytes[4] = kind;
	return bytes;
};

export function encodeCaptureFrame(frame: RuntimeCaptureFrame): Buffer {
	const payload =
		frame.type === "data"
			? Buffer.from(frame.data)
			: frame.type === "receipt"
				? Buffer.from(frame.receipt)
				: frame.type === "end" || frame.type === "release" || frame.type === "released"
					? Buffer.alloc(0)
					: Buffer.from(JSON.stringify(frame));
	const bytes = allocate(kinds[frame.type], payload.length);
	bytes.set(payload, 5);
	return bytes;
}

export function decodeCaptureFrame(bytes: Buffer): RuntimeCaptureFrame {
	const type = names[bytes[0]!];
	if (type === undefined) throw new Error("Unknown capture frame type");
	const payload = bytes.subarray(1);
	if (type === "data") return { type, data: payload };
	if (type === "receipt") return { type, receipt: payload };
	if (type === "end" || type === "release" || type === "released") {
		if (payload.length !== 0) throw new Error(`Invalid ${type} capture frame`);
		return { type };
	}
	const frame = JSON.parse(payload.toString()) as RuntimeCaptureFrame;
	if (frame.type !== type) throw new Error("Capture frame type does not match its payload");
	return frame;
}

export class CaptureFrameDecoder {
	private readonly header = Buffer.allocUnsafe(4);
	private headerBytes = 0;
	private bodyLength = 0;
	private body: Buffer[] = [];
	private bodyBytes = 0;

	get incomplete() {
		return this.headerBytes !== 0 || this.bodyLength !== 0;
	}

	*push(chunk: Buffer): Generator<RuntimeCaptureFrame> {
		let offset = 0;
		while (offset < chunk.length) {
			if (this.bodyLength === 0) {
				const size = Math.min(4 - this.headerBytes, chunk.length - offset);
				chunk.copy(this.header, this.headerBytes, offset, offset + size);
				this.headerBytes += size;
				offset += size;
				if (this.headerBytes < 4) continue;
				const length = this.header.readUInt32BE(0);
				if (length < 1) throw new Error("Invalid capture frame length");
				this.bodyLength = length;
				this.headerBytes = 0;
			}
			const size = Math.min(this.bodyLength - this.bodyBytes, chunk.length - offset);
			this.body.push(chunk.subarray(offset, offset + size));
			this.bodyBytes += size;
			offset += size;
			if (this.bodyBytes !== this.bodyLength) continue;
			const frame = Buffer.concat(this.body, this.bodyLength);
			this.bodyLength = 0;
			this.body = [];
			this.bodyBytes = 0;
			yield decodeCaptureFrame(frame);
		}
	}
}
