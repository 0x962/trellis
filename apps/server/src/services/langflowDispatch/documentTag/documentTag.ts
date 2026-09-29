import { createHash } from "node:crypto";
import type { FlowDocumentV1 } from "@trellis/api";

export const documentTag = (document: FlowDocumentV1) =>
	`"${createHash("sha256").update(JSON.stringify(document)).digest("hex")}"`;
