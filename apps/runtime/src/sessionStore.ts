import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import type {
	LaunchSpec,
	RuntimeExpectedTurn,
	RuntimeListInput,
	RuntimeMessageState,
	RuntimeMethods,
	RuntimeProcessStatus,
	RuntimeSession,
	RuntimeStream,
} from "@trellis/runtime-protocol";
import { assertExpectedTurn } from "./assertExpectedTurn.ts";
import { authenticateSession } from "./authenticateSession.ts";
import { fingerprintLaunch } from "./fingerprintLaunch.ts";
import { inspectSessionRecord } from "./inspectSessionRecord.ts";
import { launchSession } from "./launchSession";
import { matchesProcessFilters } from "./matchesProcessFilters.ts";
import { observeHarness } from "./observeHarness.ts";
import { observeLegacyTurn } from "./observeLegacyTurn.ts";
import { ProcessExitWatcher } from "./processExitWatcher.ts";
import { registerNativeDelivery } from "./registerNativeDelivery.ts";
import { defaultRetainOptions, type RetainOptions } from "./retainExited.ts";
import type { SessionRecord as Record } from "./sessionRecord.ts";
import { SessionRecords } from "./sessionRecords";
import { sessionResources } from "./sessionResources.ts";
import { stopAttempt } from "./stopAttempt.ts";
import { watchRecoveredSession } from "./watchRecoveredSession.ts";

// A host reads the output of an exited session after the exit, for example
// when it stores the transcript of a stopped agent. The record and its files
// stay for the retention after the exit, and at most `maxExitedRecords` of
// them stay at any time. The sweep runs at boot, after every exit, and once
// an hour for the records whose retention ends while nothing exits.
const sweepIntervalMs = 60 * 60 * 1000;

export class SessionStore {
	private readonly records: SessionRecords;
	private readonly exits = new ProcessExitWatcher();
	private readonly sweeper: ReturnType<typeof setInterval>;
	constructor(
		private readonly home: string,
		private readonly daemonId: string,
		private readonly retain: RetainOptions = defaultRetainOptions,
	) {
		mkdirSync(home, { recursive: true, mode: 0o700 });
		this.records = new SessionRecords(home);
		this.records.restore((record) => {
			this.save(record);
			watchRecoveredSession(record, this.exits);
		});
		this.sweep();
		this.records.removeOrphanFiles();
		this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
		this.sweeper.unref();
	}
	private sweep(now = Date.now()) {
		for (const record of this.records.values()) {
			if (record.process !== undefined || record.listeners.size > 0 || record.watchedPids.size > 0) continue;
			if (inspectSessionRecord(record).status !== "exited") continue;
			this.records.finalize(record);
		}
		this.records.removeExpired(now, this.retain);
	}
	private save(record: Record) {
		this.records.save(record);
	}

	private get(id: string) {
		const record = this.records.get(id);
		if (!record) throw Object.assign(new Error(`Session ${id} does not exist`), { code: "SESSION_NOT_FOUND" });
		return record;
	}
	*entries(input: RuntimeListInput = {}, after?: string) {
		const prefix = `${input.ids === undefined ? "r" : "i"}:${this.daemonId}:`;
		if (after !== undefined && (!after.startsWith(prefix) || !/^\d+$/.test(after.slice(prefix.length))))
			throw new Error("The runtime list cursor does not match this runtime or query.");
		const position = after === undefined ? 0 : Number(after.slice(prefix.length));
		if (!Number.isSafeInteger(position)) throw new Error("The runtime list cursor position is invalid.");
		if (input.ids !== undefined) {
			for (let index = position; index < input.ids.length; index++) {
				const record = this.records.get(input.ids[index]!);
				const session = record === undefined ? null : this.inspect(input.ids[index]!);
				yield {
					session: session !== null && matchesProcessFilters(session, input) ? session : null,
					cursor: `${prefix}${index + 1}`,
				};
			}
			return;
		}
		for (const [id, entry] of this.records.entries()) {
			if (entry.sequence <= position) continue;
			if (entry.final && (input.status === "running" || input.status === "unknown" || input.activity !== undefined))
				continue;
			const session = this.inspect(id);
			yield { session: matchesProcessFilters(session, input) ? session : null, cursor: `${prefix}${entry.sequence}` };
		}
	}
	*iterate(input: RuntimeListInput = {}) {
		for (const { session } of this.entries(input)) if (session !== null) yield session;
	}
	list(input: RuntimeListInput = {}) {
		return [...this.iterate(input)];
	}

	inspect(id: string): RuntimeProcessStatus {
		const record = this.get(id);
		const session = inspectSessionRecord(record);
		if (session.status === "exited") this.records.finalize(record);
		return session;
	}
	hasMessage({ id, messageId }: RuntimeMethods["hasMessage"]["params"]): RuntimeMessageState {
		const record = this.get(id);
		return { messageId, delivered: record.ledger.delivered(messageId), status: this.inspect(id).status };
	}
	registerNativeDelivery(input: RuntimeMethods["registerNativeDelivery"]["params"]) {
		return registerNativeDelivery(this.get(input.id), input);
	}
	observe({ id, token, event, expected }: RuntimeMethods["observe"]["params"]): RuntimeProcessStatus {
		const record = this.get(id);
		authenticateSession(record, token);
		assertExpectedTurn(record, expected);
		observeHarness(record, event);
		return this.inspect(id);
	}
	turn(input: RuntimeMethods["turn"]["params"]): RuntimeProcessStatus {
		const record = this.get(input.id);
		observeLegacyTurn(record, input);
		return this.inspect(input.id);
	}
	subscribe(
		id: string,
		listener: (change: "session" | "output") => void,
		stream: RuntimeStream = "stdout",
		output = true,
	) {
		const record = this.get(id);
		const sessionChanged = () => listener("session");
		record.listeners.add(sessionChanged);
		this.records.retain(record);
		const unsubscribe = output
			? (stream === "events" ? record.observations.log : stream === "stderr" ? record.stderr : record.log).subscribe(
					() => listener("output"),
				)
			: () => {};
		return () => {
			record.listeners.delete(sessionChanged);
			unsubscribe();
			this.records.release(record);
		};
	}
	start(spec: LaunchSpec): RuntimeSession {
		const fingerprint = fingerprintLaunch(spec);
		const existing = this.records.get(spec.id);
		if (existing) {
			if (existing.fingerprint !== null && existing.fingerprint !== fingerprint)
				throw Object.assign(new Error(`Launch ${spec.id} already has a different command`), {
					code: "LAUNCH_CONFLICT",
				});
			return this.inspect(spec.id);
		}
		const session: RuntimeSession = {
			id: spec.id,
			daemonId: this.daemonId,
			pid: null,
			mode: spec.mode,
			status: "unknown",
			startedAt: new Date().toISOString(),
			endedAt: null,
			exitCode: null,
			error: null,
		};
		const record: Record = {
			session,
			fingerprint,
			identity: null,
			launch: { command: spec.command, args: spec.args, cwd: spec.cwd },
			listeners: new Set(),
			watchedPids: new Set(),
			tokenHash: spec.env?.TRELLIS_ATTEMPT_TOKEN
				? createHash("sha256").update(spec.env.TRELLIS_ATTEMPT_TOKEN).digest()
				: null,
			activity: null,
			...sessionResources(this.home, spec.id),
			...stopAttempt(),
		};
		this.records.set(spec.id, record);
		this.save(record);
		launchSession(
			record,
			spec,
			() => this.save(record),
			() => this.sweep(),
		);
		return this.inspect(spec.id);
	}
	async input(id: string, data: string, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		assertExpectedTurn(record, expected);
		return this.inputBytes(id, Buffer.from(data, "base64"));
	}
	async inputBytes(id: string, data: Buffer, _userInput?: boolean) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		await record.process.input(data);
		return null;
	}
	async deliver(id: string, messageId: string, data: string, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		if (!record.ledger.has(messageId)) assertExpectedTurn(record, expected);
		const unpin = this.records.pin(record);
		try {
			return await record.ledger.deliver(messageId, data, () => this.input(id, data));
		} finally {
			unpin();
		}
	}
	resize(id: string, cols: number, rows: number) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		record.process.resize(cols, rows);
		return null;
	}
	async stop(id: string) {
		if (!this.records.has(id)) {
			const now = new Date().toISOString();
			const record: Record = {
				session: {
					id,
					daemonId: this.daemonId,
					pid: null,
					mode: "stdio",
					status: "exited",
					startedAt: now,
					endedAt: now,
					exitCode: null,
					error: "Canceled before launch",
				},
				fingerprint: null,
				identity: null,
				launch: null,
				listeners: new Set(),
				watchedPids: new Set(),
				tokenHash: null,
				activity: null,
				...sessionResources(this.home, id),
				stopped: Promise.resolve(undefined),
				resolveStop: () => {},
			};
			this.records.set(id, record);
			this.save(record);
		}
		const record = this.get(id);
		if (record.process) {
			const stopped = record.stopped;
			record.process.stop();
			const error = await stopped;
			if (error) throw error;
		}
		return this.inspect(id);
	}
	output(id: string, offset: number, stream: RuntimeStream = "stdout") {
		const output = this.outputBytes(id, offset, stream);
		return { ...output, data: output.data.toString("base64") };
	}
	outputBytes(id: string, offset: number, stream: RuntimeStream = "stdout") {
		const record = this.get(id);
		return (stream === "events" ? record.observations.log : stream === "stderr" ? record.stderr : record.log).readBytes(
			offset,
		);
	}
	outputComplete(id: string) {
		const record = this.get(id);
		return (
			record.process === undefined && record.watchedPids.size === 0 && record.log.complete && record.stderr.complete
		);
	}
	closeWatchers() {
		clearInterval(this.sweeper);
		this.exits.close();
	}
	async stopAll() {
		await Promise.all(
			[...this.records.values()]
				.filter((record) => record.process !== undefined)
				.map((record) => this.stop(record.session.id)),
		);
	}
}
