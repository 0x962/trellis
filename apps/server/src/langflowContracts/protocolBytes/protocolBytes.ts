import { createHash } from "node:crypto";
import type { z } from "zod";

export function protocolDigest(bytes: string): string {
	return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function readProtocolBytes<T>(schema: z.ZodType<T>, bytes: string, storedDigest?: string): T {
	if (storedDigest !== undefined && protocolDigest(bytes) !== storedDigest) throw new Error("identity_conflict");
	return schema.parse(JSON.parse(bytes));
}
