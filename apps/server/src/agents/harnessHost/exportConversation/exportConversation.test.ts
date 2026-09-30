import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../../tempDir";
import { HarnessHost } from "../harnessHost";
import { providers } from "../providers";
import type { HarnessHostOptions } from "../types";
import { exportConversation } from "./exportConversation";
import { conversationFixture } from "./fixture";

const temporary = tempDirs();
const signal = () => new AbortController().signal;

test.each(["codex", "claude", "pi", "muse", "opencode"] as const)("exports exact captured %s bytes and identity", async (harness) => {
	const f = conversationFixture(harness);
	const directory = join(await temporary("trellis-conversation-export-"), "archive");
	const result = await exportConversation(f.reader, { binding: f.binding, identity: f.identity, directory, signal: signal() });
	if (result.state !== "exported") throw new Error("fixture_export_unavailable");
	expect(result.manifest.binding).toEqual(f.binding);
	expect(result.manifest.history).toBe("available_records_only");
	expect(result.manifest.unavailable).toEqual(f.inventory.unavailable);
	expect(await readFile(join(directory, "files/0"))).toEqual(Buffer.from(f.bytes));
	const manifestBytes = await readFile(join(directory, "manifest.json"));
	expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(result.manifestSha256);
	const receiptBytes = await readFile(join(directory, "capture-receipt.json"), "utf8");
	expect(receiptBytes.startsWith(" ")).toBe(true);
	expect(createHash("sha256").update(receiptBytes).digest("hex")).toBe(result.receiptSha256);
	expect((await stat(directory)).mode & 0o777).toBe(0o700);
	expect((await stat(join(directory, "manifest.json"))).mode & 0o777).toBe(0o600);
	expect((await stat(join(directory, "files/0"))).mode & 0o777).toBe(0o600);
	expect(f.calls).toEqual(["inventory", `read:${f.inventory.files[0]!.path}`, "seal"]);
});

test("the real host refuses export without a capture producer", async () => {
	const f = conversationFixture();
	const directory = join(await temporary("trellis-conversation-unavailable-"), "archive");
	const host = new HarnessHost({} as HarnessHostOptions);
	expect(await host.exportConversation({ binding: f.binding, identity: f.identity, directory, signal: signal() })).toEqual({
		state: "unavailable", reason: "consistency_unavailable",
	});
	expect(existsSync(directory)).toBe(false);
});

test("missing, ambiguous, unsupported, and linked content stays unavailable", () => {
	const f = conversationFixture();
	const select = providers.codex.conversationExport.select;
	expect(select(f.identity, { ...f.inventory, files: [] })).toMatchObject({ reason: "historical_content_missing" });
	expect(select(f.identity, { ...f.inventory, files: [...f.inventory.files, ...f.inventory.files] })).toMatchObject({ reason: "conversation_identity_ambiguous" });
	expect(select(f.identity, { ...f.inventory, files: [{ ...f.inventory.files[0]!, kind: "symlink" }] })).toMatchObject({ reason: "conversation_file_unavailable" });
	const opencode = conversationFixture("opencode");
	expect(providers.opencode.conversationExport.select(opencode.identity, { ...opencode.inventory, sourceKind: "account-profile" })).toEqual({ state: "unavailable", reason: "provider_export_required" });
});

test("rejects a different capture identity before any read", async () => {
	const f = conversationFixture();
	const directory = join(await temporary("trellis-conversation-identity-"), "archive");
	await expect(exportConversation(f.reader, { binding: { ...f.binding, blockId: "other" }, identity: f.identity, directory, signal: signal() })).rejects.toThrow("conversation_capture_identity_conflict");
	expect(f.calls).toEqual([]);
	expect(existsSync(directory)).toBe(false);
});

test("a released capture leaves the partial export unsealed", async () => {
	const f = conversationFixture();
	const directory = join(await temporary("trellis-conversation-release-"), "archive");
	const reader = { ...f.reader, async seal() { f.release(); return f.reader.seal({ binding: f.binding, rootId: f.inventory.rootId, manifestSha256: "unused" }, signal()); } };
	await expect(exportConversation(reader, { binding: f.binding, identity: f.identity, directory, signal: signal() })).rejects.toThrow("capture_released");
	expect(existsSync(join(directory, "manifest.partial"))).toBe(true);
	expect(existsSync(join(directory, "manifest.json"))).toBe(false);
});

test("rejects changed byte hashes without a seal", async () => {
	const f = conversationFixture();
	f.inventory.files[0]!.sha256 = "0".repeat(64);
	const directory = join(await temporary("trellis-conversation-digest-"), "archive");
	await expect(exportConversation(f.reader, { binding: f.binding, identity: f.identity, directory, signal: signal() })).rejects.toThrow("conversation_capture_bytes_conflict");
	expect(f.calls).not.toContain("seal");
	expect(existsSync(join(directory, "manifest.json"))).toBe(false);
});

test("rejects a different session inside exact captured bytes", async () => {
	const f = conversationFixture();
	const bytes = new TextEncoder().encode('{"type":"session_meta","payload":{"id":"other-session"}}\n');
	f.inventory.files[0]!.bytes = bytes.length;
	f.inventory.files[0]!.sha256 = createHash("sha256").update(bytes).digest("hex");
	const reader = { ...f.reader, async *read() { yield bytes; } };
	const directory = join(await temporary("trellis-conversation-session-"), "archive");
	await expect(exportConversation(reader, { binding: f.binding, identity: f.identity, directory, signal: signal() }))
		.rejects.toThrow("conversation_session_conflict");
	expect(f.calls).not.toContain("seal");
	expect(existsSync(join(directory, "manifest.json"))).toBe(false);
});

test("rejects a receipt for another manifest", async () => {
	const f = conversationFixture();
	const reader = {
		...f.reader,
		async seal() {
			return new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, kind: "trellis-runtime-capture-seal", binding: f.binding, rootId: f.inventory.rootId, manifestSha256: "0".repeat(64) }));
		},
	};
	const directory = join(await temporary("trellis-conversation-seal-"), "archive");
	await expect(exportConversation(reader, { binding: f.binding, identity: f.identity, directory, signal: signal() }))
		.rejects.toThrow("conversation_capture_seal_conflict");
	expect(existsSync(join(directory, "manifest.partial"))).toBe(true);
	expect(existsSync(join(directory, "manifest.json"))).toBe(false);
});
