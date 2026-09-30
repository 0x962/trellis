import { createHash } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type {
	ConversationCaptureBinding,
	ConversationCaptureReader,
	ConversationIdentity,
} from "../../harnesses/conversationExport/types";
import { providers } from "../providers";
import { captureInventory } from "./captureInventory";
import { copyCapturedFile } from "./copyCapturedFile";

export type ConversationExportInput = {
	binding: ConversationCaptureBinding;
	identity: ConversationIdentity;
	directory: string;
	signal: AbortSignal;
};

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sealSchema = z.object({
	schemaVersion: z.literal(1),
	kind: z.literal("trellis-runtime-capture-seal"),
	binding: z.unknown(),
	rootId: z.string().min(1),
	manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

async function writePrivate(path: string, bytes: string | Uint8Array) {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(bytes);
		await file.sync();
	} finally {
		await file.close();
	}
}

export async function exportConversation(
	reader: ConversationCaptureReader | undefined,
	input: ConversationExportInput,
) {
	input.signal.throwIfAborted();
	if (reader === undefined) return { state: "unavailable" as const, reason: "consistency_unavailable" };
	if (!isDeepStrictEqual(reader.binding, input.binding)) throw new Error("conversation_capture_identity_conflict");
	const captured = await reader.inventory(input.binding, input.signal);
	if (!isDeepStrictEqual(captured.binding, input.binding)) throw new Error("conversation_capture_identity_conflict");
	const inventory = captureInventory(captured, input.identity);
	if (inventory.state === "unavailable") return inventory;
	const adapter = providers[input.identity.harness].conversationExport;
	const selection = adapter.select(input.identity, inventory);
	if (selection.state === "unavailable") return selection;
	if (!isAbsolute(input.directory)) throw new Error("conversation_export_destination_invalid");
	await mkdir(input.directory, { mode: 0o700 });
	const filesRoot = join(input.directory, "files");
	await mkdir(filesRoot, { mode: 0o700 });
	const files = [];
	for (const [index, file] of selection.files.entries()) {
		input.signal.throwIfAborted();
		const path = `files/${index}`;
		const result = await copyCapturedFile({
			source: reader.read({ binding: input.binding, rootId: inventory.rootId, path: file.path }, input.signal),
			target: join(input.directory, path),
			file,
			transcript: file.path === selection.transcript,
			adapter,
			sessionId: input.identity.providerSessionId,
			signal: input.signal,
		});
		files.push({ path, sourcePath: file.path, sourceMode: file.mode, ...result });
	}
	const manifest = {
		version: 1,
		binding: input.binding,
		identity: input.identity,
		rootId: inventory.rootId,
		sourceKind: inventory.sourceKind,
		history: "available_records_only",
		unavailable: inventory.unavailable,
		files,
	};
	const manifestBytes = `${JSON.stringify(manifest)}\n`;
	const manifestSha256 = hash(manifestBytes);
	await writePrivate(join(input.directory, "manifest.partial"), manifestBytes);
	const sealBytes = await reader.seal({ binding: input.binding, rootId: inventory.rootId, manifestSha256 }, input.signal);
	const seal = sealSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sealBytes)));
	if (
		!isDeepStrictEqual(seal.binding, input.binding) ||
		seal.rootId !== inventory.rootId ||
		seal.manifestSha256 !== manifestSha256
	)
		throw new Error("conversation_capture_seal_conflict");
	input.signal.throwIfAborted();
	await writePrivate(join(input.directory, "capture-receipt.json"), sealBytes);
	await rename(join(input.directory, "manifest.partial"), join(input.directory, "manifest.json"));
	const directory = await open(input.directory, "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
	return {
		state: "exported" as const,
		directory: input.directory,
		manifestSha256,
		receiptSha256: hash(sealBytes),
		manifest,
	};
}
