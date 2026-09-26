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
import { acceptSessionInput } from "./acceptSessionInput";
import { assertExpectedTurn } from "./assertExpectedTurn.ts";
import { authenticateSession } from "./authenticateSession.ts";
import { canceledSession } from "./canceledSession";
import { fingerprintLaunch } from "./fingerprintLaunch.ts";
import { expireIdleSessions } from "./idleCleanup";
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

// Resume requires the saved provider identity and launch directory. Idle exits stay
// on disk until a successful resume or explicit stop releases their records.
const sweepIntervalMs = 60 * 60 * 1000;

export class SessionStore {
	private readonly records: SessionRecords;
	private readonly exits = new ProcessExitWatcher();
	private readonly idleSweeper: ReturnType<typeof setInterval>;
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
		this.idleSweeper = setInterval(() => this.expireIdle(), 30_000);
		this.idleSweeper.unref();
	}
	expireIdle(now = Date.now()) {
		expireIdleSessions(this.records.values(), (record) => this.save(record), now);
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
			// A session whose exit is confirmed costs a file read, so a read
			// passes it over unless the caller asked for exits by name. A caller
			// that wants one exited session names it under `ids`.
			if (entry.final && input.status !== "exited") continue;
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
		return {
			messageId,
			registered: record.ledger.has(messageId),
			delivered: record.ledger.delivered(messageId),
			status: this.inspect(id).status,
		};
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
	async input(id: string, data: string, expected?: RuntimeExpectedTurn, userInput = true) {
		const record = this.get(id);
		assertExpectedTurn(record, expected);
		return this.inputBytes(id, Buffer.from(data, "base64"), userInput);
	}
	async inputBytes(id: string, data: Buffer, userInput = true) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		acceptSessionInput(record, userInput);
		await record.process.input(data);
		return null;
	}
	async deliver(id: string, messageId: string, data: string, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		if (!record.ledger.has(messageId)) {
			assertExpectedTurn(record, expected);
			acceptSessionInput(record);
		}
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
			const record = canceledSession(this.home, this.daemonId, id);
			this.records.set(id, record);
			this.save(record);
		}
		const record = this.get(id);
		if (record.retainForResume) {
			record.retainForResume = false;
			this.save(record);
		}
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
		clearInterval(this.idleSweeper);
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
