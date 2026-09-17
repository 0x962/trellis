import { randomBytes } from "node:crypto";

// A time-ordered UUID (version 7). The Muse Session Protocol requires one
// as the idempotency handle of every command and refuses a random UUID.
export function uuid7(now = Date.now()): string {
	const bytes = randomBytes(16);
	bytes.writeUIntBE(now, 0, 6);
	bytes[6] = 0x70 | (bytes[6]! & 0x0f);
	bytes[8] = 0x80 | (bytes[8]! & 0x3f);
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
