import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { RuntimeDelivery } from "@trellis/runtime-protocol";

type Entry = RuntimeDelivery & { hash: string; acknowledged?: boolean };
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
	acknowledge(messageId: string, initial = false) {
		if (initial && !this.entries.has(messageId))
			this.entries.set(messageId, { messageId, hash: `initial:${messageId}`, status: "written" });
		const entry = this.entries.get(messageId);
		if (!entry || entry.acknowledged) return;
		entry.acknowledged = true;
		this.save();
	}
	async deliver(messageId: string, data: string, write: () => Promise<unknown>): Promise<RuntimeDelivery> {
		const hash = createHash("sha256").update(data).digest("hex");
		const existing = this.entries.get(messageId);
		if (existing) {
			if (existing.hash !== hash) throw new Error(`Message ${messageId} already has different bytes`);
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
