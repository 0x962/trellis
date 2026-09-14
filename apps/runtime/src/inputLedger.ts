import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { RuntimeDelivery } from "@trellis/runtime-protocol";

type Entry = RuntimeDelivery & { hash: string };
export class InputLedger {
	private readonly entries: Map<string, Entry>;
	constructor(private readonly path: string) {
		this.entries = new Map(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : []);
	}
	private save() {
		writeFileSync(`${this.path}.tmp`, JSON.stringify([...this.entries]), { mode: 0o600, flush: true });
		renameSync(`${this.path}.tmp`, this.path);
	}
	deliver(messageId: string, data: string, write: () => void): RuntimeDelivery {
		const hash = createHash("sha256").update(data).digest("hex");
		const existing = this.entries.get(messageId);
		if (existing) {
			if (existing.hash !== hash) throw new Error(`Message ${messageId} already has different bytes`);
			return { messageId, status: existing.status };
		}
		const entry: Entry = { messageId, status: "unknown", hash };
		this.entries.set(messageId, entry);
		this.save();
		write();
		entry.status = "written";
		this.save();
		return { messageId, status: entry.status };
	}
}
