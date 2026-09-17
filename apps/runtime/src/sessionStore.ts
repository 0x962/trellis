import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { inspectProcess } from "./inspectProcess.ts";
import { inspectSessionRecord } from "./inspectSessionRecord.ts";
import { matchesProcessFilters } from "./matchesProcessFilters.ts";
import { observeHarness } from "./observeHarness.ts";
import { observeLegacyTurn } from "./observeLegacyTurn.ts";
import { ProcessExitWatcher } from "./processExitWatcher.ts";
import { createProcessHandle } from "./processHandle.ts";
import { registerNativeDelivery } from "./registerNativeDelivery.ts";
import { sessionFileSuffixes, sessionFiles } from "./sessionFiles.ts";
import type { SessionRecord as Record } from "./sessionRecord.ts";
import { sessionResources } from "./sessionResources.ts";
import { stopAttempt } from "./stopAttempt.ts";
import { watchRecoveredSession } from "./watchRecoveredSession.ts";

// A host reads the output of an exited session after the exit, for example
// when it stores the transcript of a stopped agent. The record and its files
// stay for this long after the exit, and then the runtime removes them.
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const sweepIntervalMs = 60 * 60 * 1000;

export class SessionStore {
	private readonly records = new Map<string, Record>();
	private readonly exits = new ProcessExitWatcher();
	private readonly sweeper: ReturnType<typeof setInterval>;
	constructor(
		private readonly home: string,
		private readonly daemonId: string,
	) {
		mkdirSync(home, { recursive: true, mode: 0o700 });
		for (const file of readdirSync(home).filter((file) => file.endsWith(".session.json"))) {
			const saved = JSON.parse(readFileSync(join(home, file), "utf8")) as {
				session: RuntimeSession;
				fingerprint: string | null;
				identity?: string | null;
				launch?: RuntimeProcessStatus["launch"];
			};
			if (saved.session.status === "running") saved.session.status = "unknown";
			const record: Record = {
				...saved,
				identity: saved.identity ?? null,
				launch: saved.launch ?? null,
				listeners: new Set<() => void>(),
				watchedPids: new Set<number>(),
				tokenHash: null,
				activity: null,
				...sessionResources(home, saved.session.id),
				stopped: Promise.resolve(undefined),
				resolveStop: () => {},
			};
			record.activity = record.observations.activity;
			this.records.set(saved.session.id, record);
			this.save(record);
			watchRecoveredSession(record, this.exits);
		}
		this.sweep();
		this.removeOrphanFiles();
		this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
		this.sweeper.unref();
	}
	// Removes each exited session whose exit is older than retentionMs. A record
	// recovered from a crash has no endedAt, so its startedAt sets its age.
	private sweep(now = Date.now()) {
		for (const record of this.records.values()) {
			if (record.process !== undefined || record.listeners.size > 0) continue;
			if (inspectSessionRecord(record).status !== "exited") continue;
			const endedAt = record.session.endedAt ?? record.session.startedAt;
			if (now - Date.parse(endedAt) < retentionMs) continue;
			this.records.delete(record.session.id);
			for (const path of Object.values(sessionFiles(this.home, record.session.id))) rmSync(path, { force: true });
		}
	}
	// A session file without a session record belongs to a session that a
	// sweep removed before the runtime wrote the file, or to a removed record
	// whose file removal did not complete.
	private removeOrphanFiles() {
		for (const file of readdirSync(this.home)) {
			const suffix = sessionFileSuffixes.find((candidate) => file.endsWith(candidate));
			if (suffix === undefined) continue;
			if (this.records.has(file.slice(0, -suffix.length))) continue;
			rmSync(join(this.home, file), { force: true });
		}
	}
	private save(record: Record) {
		const path = join(this.home, `${record.session.id}.session.json`);
		writeFileSync(
			`${path}.tmp`,
			JSON.stringify({
				session: record.session,
				fingerprint: record.fingerprint,
				identity: record.identity,
				launch: record.launch,
			}),
			{
				mode: 0o600,
			},
		);
		renameSync(`${path}.tmp`, path);
		for (const listener of record.listeners) listener();
	}
	private get(id: string) {
		const record = this.records.get(id);
		if (!record) throw Object.assign(new Error(`Session ${id} does not exist`), { code: "SESSION_NOT_FOUND" });
		return record;
	}
	list(input: RuntimeListInput = {}) {
		const ids = input.ids ?? [...this.records.keys()];
		return ids
			.flatMap((id) => {
				const record = this.records.get(id);
				return record === undefined ? [] : [inspectSessionRecord(record)];
			})
			.filter((session) => matchesProcessFilters(session, input));
	}
	inspect(id: string): RuntimeProcessStatus {
		return inspectSessionRecord(this.get(id));
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
	subscribe(id: string, listener: () => void, stream: RuntimeStream = "stdout", output = true) {
		const record = this.get(id);
		record.listeners.add(listener);
		const unsubscribe = output
			? (stream === "events" ? record.observations.log : stream === "stderr" ? record.stderr : record.log).subscribe(
					listener,
				)
			: () => {};
		return () => {
			record.listeners.delete(listener);
			unsubscribe();
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
		let cleanupError: string | null = null;
		const exit = (code: number | null, error: string | null = session.error) => {
			clearTimeout(record.timer);
			session.status = "exited";
			session.exitCode = code;
			session.error =
				(error === cleanupError ? null : error) ??
				(code !== null && code !== 0 ? `Process ${spec.command} exited with code ${code}` : null);
			session.endedAt = new Date().toISOString();
			record.process = undefined;
			this.save(record);
			record.resolveStop();
		};
		try {
			record.process = createProcessHandle(
				spec,
				(data) => record.log.append(data),
				(data) => record.stderr.append(data),
				(code) => exit(code),
				(error) => exit(null, error.message),
				(error) => {
					clearTimeout(record.timer);
					session.status = "unknown";
					cleanupError = `Process cleanup is unconfirmed: ${error.message}`;
					session.error = cleanupError;
					this.save(record);
					record.resolveStop(error);
					Object.assign(record, stopAttempt());
				},
				(error) => {
					session.error = `Input delivery is unconfirmed: ${error.message}`;
					this.save(record);
				},
			);
		} catch (error) {
			exit(null, (error as Error).message);
			return this.inspect(spec.id);
		}
		session.pid = record.process.pid > 0 ? record.process.pid : null;
		const observation = session.pid === null ? { kind: "missing" as const } : inspectProcess(session.pid);
		if (observation.kind === "live") record.identity = observation.process.identity;
		session.status = "running";
		this.save(record);
		if (spec.timeoutMs !== undefined)
			record.timer = setTimeout(() => {
				session.error = `Process timed out after ${spec.timeoutMs} ms`;
				this.save(record);
				record.process!.stop();
			}, spec.timeoutMs);
		return this.inspect(spec.id);
	}
	async input(id: string, data: string, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		assertExpectedTurn(record, expected);
		const bytes = Buffer.from(data, "base64");
		await record.process.input(bytes);
		return null;
	}
	deliver(id: string, messageId: string, data: string, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		if (!record.ledger.has(messageId)) assertExpectedTurn(record, expected);
		return record.ledger.deliver(messageId, data, () => this.input(id, data));
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
		const record = this.get(id);
		return (stream === "events" ? record.observations.log : stream === "stderr" ? record.stderr : record.log).read(
			offset,
		);
	}
	outputComplete(id: string) {
		const record = this.get(id);
		return record.process === undefined && record.watchedPids.size === 0;
	}
	closeWatchers() {
		clearInterval(this.sweeper);
		this.exits.close();
	}
	async stopAll() {
		await Promise.all(
			this.list()
				.filter((session) => session.status === "running")
				.map((session) => this.stop(session.id)),
		);
	}
}
