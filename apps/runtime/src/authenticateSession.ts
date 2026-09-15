import { createHash, timingSafeEqual } from "node:crypto";
import { inspectSessionRecord } from "./inspectSessionRecord.ts";
import type { SessionRecord } from "./sessionRecord.ts";

export function authenticateSession(record: SessionRecord, token: string) {
	if (record.tokenHash === null || !timingSafeEqual(record.tokenHash, createHash("sha256").update(token).digest()))
		throw new Error("The attempt token does not match this process");
	if (!inspectSessionRecord(record).controllable) throw new Error("The process is not controllable");
}
