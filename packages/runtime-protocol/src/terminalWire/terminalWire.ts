import { MAX_TERMINAL_DIMENSION, type RuntimeProcessStatus, type RuntimeTerminalEvent } from "../index.ts";

export type TerminalFrame =
	| RuntimeTerminalEvent
	| { type: "input"; data: Uint8Array; userInput: boolean }
	| { type: "resize"; cols: number; rows: number }
	| { type: "ack" }
	| { type: "error"; message: string };

const allocateFrame = (kind: number, payloadBytes: number) => {
	const bytes = Buffer.allocUnsafe(5 + payloadBytes);
	bytes.writeUInt32BE(1 + payloadBytes, 0);
	bytes[4] = kind;
	return bytes;
};

export function encodeTerminalFrame(frame: TerminalFrame): Buffer {
	switch (frame.type) {
		case "input": {
			const bytes = allocateFrame(1, 1 + frame.data.byteLength);
			bytes[5] = Number(frame.userInput);
			bytes.set(frame.data, 6);
			return bytes;
		}
		case "resize": {
			const bytes = allocateFrame(2, 4);
			bytes.writeUInt16BE(frame.cols, 5);
			bytes.writeUInt16BE(frame.rows, 7);
			return bytes;
		}
		case "output": {
			const bytes = allocateFrame(3, 17 + frame.data.byteLength);
			bytes.writeDoubleBE(frame.startOffset, 5);
			bytes.writeDoubleBE(frame.nextOffset, 13);
			bytes[21] = Number(frame.truncated);
			bytes.set(frame.data, 22);
			return bytes;
		}
		case "session": {
			const payload = Buffer.from(JSON.stringify(frame.session));
			const bytes = allocateFrame(4, payload.length);
			bytes.set(payload, 5);
			return bytes;
		}
		case "error": {
			const payload = Buffer.from(frame.message);
			const bytes = allocateFrame(5, payload.length);
			bytes.set(payload, 5);
			return bytes;
		}
		case "ack":
			return allocateFrame(6, 0);
	}
}

export function decodeTerminalFrame(bytes: Buffer): TerminalFrame {
	const payload = bytes.subarray(1);
	switch (bytes[0]) {
		case 1:
			if (payload.length < 1 || payload[0]! > 1) throw new Error("Invalid terminal input frame");
			return { type: "input", userInput: payload[0] === 1, data: payload.subarray(1) };
		case 2: {
			if (payload.length !== 4) throw new Error("Invalid terminal resize frame");
			const cols = payload.readUInt16BE(0);
			const rows = payload.readUInt16BE(2);
			if (cols < 1 || cols > MAX_TERMINAL_DIMENSION || rows < 1 || rows > MAX_TERMINAL_DIMENSION)
				throw new Error("Invalid terminal dimensions");
			return { type: "resize", cols, rows };
		}
		case 3: {
			if (payload.length < 17) throw new Error("Invalid terminal output frame");
			const startOffset = payload.readDoubleBE(0);
			const nextOffset = payload.readDoubleBE(8);
			if (
				!Number.isSafeInteger(startOffset) ||
				startOffset < 0 ||
				!Number.isSafeInteger(nextOffset) ||
				nextOffset !== startOffset + payload.length - 17 ||
				payload[16]! > 1
			)
				throw new Error("Invalid terminal output offsets");
			return { type: "output", startOffset, nextOffset, truncated: payload[16] === 1, data: payload.subarray(17) };
		}
		case 4:
			return { type: "session", session: JSON.parse(payload.toString()) as RuntimeProcessStatus };
		case 5:
			return { type: "error", message: payload.toString() };
		case 6:
			if (payload.length !== 0) throw new Error("Invalid terminal acknowledgement frame");
			return { type: "ack" };
		default:
			throw new Error("Unknown terminal frame type");
	}
}

export class TerminalFrameDecoder {
	private readonly header = Buffer.allocUnsafe(4);
	private headerBytes = 0;
	private bodyLength = 0;
	private body: Buffer[] = [];
	private bodyBytes = 0;
	get incomplete() {
		return this.headerBytes !== 0 || this.bodyLength !== 0;
	}
	*push(chunk: Buffer): Generator<TerminalFrame> {
		let offset = 0;
		while (offset < chunk.length) {
			if (this.bodyLength === 0) {
				const size = Math.min(4 - this.headerBytes, chunk.length - offset);
				chunk.copy(this.header, this.headerBytes, offset, offset + size);
				this.headerBytes += size;
				offset += size;
				if (this.headerBytes < 4) continue;
				const length = this.header.readUInt32BE(0);
				if (length < 1) throw new Error("Invalid terminal frame length");
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
			yield decodeTerminalFrame(frame);
		}
	}
}
