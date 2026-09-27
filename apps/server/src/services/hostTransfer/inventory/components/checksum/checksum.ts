import { createHash } from "node:crypto";

export const checksum = (value: string) => createHash("sha256").update(value).digest("hex");
