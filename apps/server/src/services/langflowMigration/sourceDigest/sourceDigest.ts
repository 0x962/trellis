import { createHash } from "node:crypto";

export const sourceDigest = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
