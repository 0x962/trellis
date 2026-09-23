import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeProcessStatus, RuntimeSession } from "@trellis/runtime-protocol";
import { exitedRecordsToRemove, type RetainOptions } from "../retainExited.ts";
import { sessionFileSuffixes, sessionFiles } from "../sessionFiles.ts";
import type { SessionRecord } from "../sessionRecord.ts";
import { sessionResources } from "../sessionResources.ts";

type SavedRecord = {
	retainForResume?: boolean;
	session: RuntimeSession;
	fingerprint: string | null;
	identity?: string | null;
	launch?: RuntimeProcessStatus["launch"];
};
type IndexEntry = {
	retainForResume: boolean;
	sequence: number;
	final: boolean;
	retainedAt: number;
	tokenHash: Buffer | null;
	activity?: RuntimeProcessStatus["activity"];
};
const historyCacheLimit = 8;

// Active processes and subscribers keep their complete records. Exited history
// keeps only an index entry until a caller requests that attempt by ID.
export class SessionRecords {
	private readonly active = new Map<string, SessionRecord>();
	private readonly history = new Map<string, SessionRecord>();
	private readonly index = new Map<string, IndexEntry>();
	private readonly operations = new WeakMap<SessionRecord, number>();
	private sequence = 0;
	constructor(private readonly home: string) {}
	private read(id: string): SavedRecord {
		return JSON.parse(readFileSync(sessionFiles(this.home, id).session, "utf8"));
	}
	private restoreRecord(saved: SavedRecord): SessionRecord {
		const record: SessionRecord = {
			...saved,
			identity: saved.identity ?? null,
			launch: saved.launch ?? null,
			listeners: new Set(),
			watchedPids: new Set(),
			tokenHash: this.index.get(saved.session.id)?.tokenHash ?? null,
			activity: null,
			...sessionResources(this.home, saved.session.id),
			stopped: Promise.resolve(undefined),
			resolveStop: () => {},
		};
		const activity = this.index.get(saved.session.id)?.activity;
		record.activity = activity === undefined ? record.observations.activity : activity;
		return record;
	}
	private remember(
		session: RuntimeSession,
		tokenHash = this.index.get(session.id)?.tokenHash ?? null,
		activity = this.index.get(session.id)?.activity,
		retainForResume = this.index.get(session.id)?.retainForResume ?? false,
	) {
		this.index.set(session.id, {
			retainForResume,
			sequence: this.index.get(session.id)?.sequence ?? ++this.sequence,
			final: this.index.get(session.id)?.final === true || (session.status === "exited" && session.endedAt !== null),
			retainedAt: Date.parse(session.endedAt ?? session.startedAt),
			tokenHash,
			activity,
		});
	}
	restore(recover: (record: SessionRecord) => void) {
		for (const file of readdirSync(this.home).filter((file) => file.endsWith(".session.json"))) {
			const saved = this.read(file.slice(0, -".session.json".length));
			this.remember(saved.session, null, undefined, saved.retainForResume);
			if (saved.session.status === "exited" && saved.session.endedAt !== null) continue;
			if (saved.session.status === "running") saved.session.status = "unknown";
			const record = this.restoreRecord(saved);
			this.active.set(saved.session.id, record);
			recover(record);
		}
	}
	has(id: string) {
		return this.index.has(id);
	}
	set(id: string, record: SessionRecord) {
		this.remember(record.session, record.tokenHash, record.activity, record.retainForResume);
		this.history.delete(id);
		this.active.set(id, record);
	}
	get(id: string): SessionRecord | undefined {
		const active = this.active.get(id);
		if (active) return active;
		if (!this.index.has(id)) return undefined;
		const record = this.history.get(id) ?? this.restoreRecord(this.read(id));
		this.history.delete(id);
		this.history.set(id, record);
		if (this.history.size > historyCacheLimit) {
			const oldest = this.history.values().next().value!;
			this.remember(oldest.session, oldest.tokenHash, oldest.activity);
			this.history.delete(oldest.session.id);
		}
		return record;
	}
	retain(record: SessionRecord) {
		this.history.delete(record.session.id);
		this.active.set(record.session.id, record);
	}
	pin(record: SessionRecord) {
		this.retain(record);
		this.operations.set(record, (this.operations.get(record) ?? 0) + 1);
		return () => {
			this.operations.set(record, this.operations.get(record)! - 1);
			this.release(record);
		};
	}
	release(record: SessionRecord) {
		if (
			!this.index.get(record.session.id)?.final ||
			record.process !== undefined ||
			record.listeners.size > 0 ||
			(this.operations.get(record) ?? 0) > 0 ||
			record.watchedPids.size > 0 ||
			!record.log.complete ||
			!record.stderr.complete
		)
			return;
		this.remember(record.session, record.tokenHash, record.activity, record.retainForResume);
		this.active.delete(record.session.id);
		this.history.delete(record.session.id);
	}
	finalize(record: SessionRecord) {
		if (this.index.get(record.session.id)!.final) return;
		if (record.process !== undefined || record.watchedPids.size > 0 || !record.log.complete || !record.stderr.complete)
			return;
		this.index.get(record.session.id)!.final = true;
		this.release(record);
	}
	save(record: SessionRecord) {
		const path = sessionFiles(this.home, record.session.id).session;
		writeFileSync(
			`${path}.tmp`,
			JSON.stringify({
				session: record.session,
				retainForResume: record.retainForResume,
				fingerprint: record.fingerprint,
				identity: record.identity,
				launch: record.launch,
			}),
			{ mode: 0o600 },
		);
		renameSync(`${path}.tmp`, path);
		this.remember(record.session, record.tokenHash, record.activity, record.retainForResume);
		for (const listener of record.listeners) listener();
		this.release(record);
	}
	values() {
		return this.active.values();
	}
	entries() {
		return this.index.entries();
	}
	removeExpired(now: number, options: RetainOptions) {
		const exited = [...this.index]
			.filter(([id, entry]) => entry.final && !entry.retainForResume && !this.active.has(id))
			.map(([id, entry]) => ({ record: id, endedAt: entry.retainedAt }));
		for (const id of exitedRecordsToRemove(exited, now, options)) {
			this.index.delete(id);
			this.history.delete(id);
			for (const path of Object.values(sessionFiles(this.home, id))) rmSync(path, { force: true });
		}
	}
	removeOrphanFiles() {
		for (const file of readdirSync(this.home)) {
			const suffix = sessionFileSuffixes.find((candidate) => file.endsWith(candidate));
			if (suffix === undefined || this.index.has(file.slice(0, -suffix.length))) continue;
			rmSync(join(this.home, file), { force: true });
		}
	}
}
