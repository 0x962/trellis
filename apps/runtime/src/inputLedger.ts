import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { RuntimeDelivery, RuntimeNativeDelivery } from "@trellis/runtime-protocol";

type Entry = RuntimeDelivery & { hash: string; acknowledged?: boolean; transport?: "native" };
export class InputLedger {
	private readonly entries: Map<string, Entry>;
	private readonly pending = new Map<string, Promise<void>>();
	constructor(private readonly path: string) {
		this.entries = new Map(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : []);
	}
	private save() {
		writeFileSync(`${this.path}.tmp`, JSON.stringify([...this.entries]), { mode: 0o600, flush: true });
		renameSync(`${this.path}.tmp`, this.path);
	}
	acknowledgedMessageIds() {
		return [...this.entries.values()].filter((entry) => entry.acknowledged).map((entry) => entry.messageId);
	}
	has(messageId: string) {
		return this.entries.has(messageId);
	}
	// True when the bytes of this message reached the session: the write to
	// the terminal finished, or the harness hook reported that the message
	// started a turn. An entry that only reserves the identifier, which is
	// what a started but unfinished write leaves, is not proof, so it counts
	// as not delivered.
	delivered(messageId: string) {
		const entry = this.entries.get(messageId);
		return entry !== undefined && (entry.acknowledged === true || entry.status === "written");
	}
	acknowledge(messageId: string, initial = false) {
		if (initial && !this.entries.has(messageId))
			this.entries.set(messageId, { messageId, hash: `initial:${messageId}`, status: "written" });
		const entry = this.entries.get(messageId);
		if (!entry || entry.acknowledged) return;
		entry.acknowledged = true;
		this.save();
	}
	registerNative(messageId: string, promptDigest: string, claim: () => void): RuntimeNativeDelivery {
		const existing = this.entries.get(messageId);
		if (existing) {
			if (existing.transport !== "native" || existing.hash !== promptDigest)
				throw new Error(`Message ${messageId} already has different bytes or transport`);
			return { messageId, claimed: false, status: existing.acknowledged ? "acknowledged" : "unknown" };
		}
		claim();
		this.entries.set(messageId, { messageId, hash: promptDigest, status: "unknown", transport: "native" });
		this.save();
		return { messageId, claimed: true, status: "unknown" };
	}
	async deliver(messageId: string, data: string, write: () => Promise<unknown>): Promise<RuntimeDelivery> {
		const hash = createHash("sha256").update(data).digest("hex");
		const existing = this.entries.get(messageId);
		if (existing) {
			if (existing.transport === "native" || existing.hash !== hash)
				throw new Error(`Message ${messageId} already has different bytes`);
			await this.pending.get(messageId);
			return { messageId, status: existing.status };
		}
		const entry: Entry = { messageId, status: "unknown", hash };
		this.entries.set(messageId, entry);
		this.save();
		const pending = (async () => {
			await write();
			entry.status = "written";
			this.save();
		})();
		this.pending.set(messageId, pending);
		try {
			await pending;
		} finally {
			this.pending.delete(messageId);
		}
		return { messageId, status: entry.status };
	}
}
