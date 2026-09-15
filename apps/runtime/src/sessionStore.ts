import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	LaunchSpec,
	RuntimeExpectedTurn,
	RuntimeListInput,
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
import type { SessionRecord as Record } from "./sessionRecord.ts";
import { sessionResources } from "./sessionResources.ts";
import { watchRecoveredSession } from "./watchRecoveredSession.ts";

export class SessionStore {
	private readonly records = new Map<string, Record>();
	private readonly exits = new ProcessExitWatcher();
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
				inputPending: false,
				...sessionResources(home, saved.session.id),
				stopped: Promise.resolve(),
				resolveStop: () => {},
			};
			record.activity = record.observations.activity;
			this.records.set(saved.session.id, record);
			this.save(record);
			watchRecoveredSession(record, this.exits);
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
		return [...this.records.keys()]
			.map((id) => this.inspect(id))
			.filter((session) => matchesProcessFilters(session, input));
	}
	inspect(id: string): RuntimeProcessStatus {
		return inspectSessionRecord(this.get(id));
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
		let resolveStop!: () => void;
		const stopped = new Promise<void>((resolve) => {
			resolveStop = resolve;
		});
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
			inputPending: false,
			...sessionResources(this.home, spec.id),
			stopped,
			resolveStop,
		};
		this.records.set(spec.id, record);
		this.save(record);
		const exit = (code: number | null, error: string | null = session.error) => {
			clearTimeout(record.timer);
			session.status = "exited";
			session.exitCode = code;
			session.error =
				error ?? (code !== null && code !== 0 ? `Process ${spec.command} exited with code ${code}` : null);
			session.endedAt = new Date().toISOString();
			record.process = undefined;
			this.save(record);
			resolveStop();
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
					session.error = `Process cleanup is unconfirmed: ${error.message}`;
					record.process = undefined;
					this.save(record);
					resolveStop();
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
	async input(id: string, data: string, userInput = false, expected?: RuntimeExpectedTurn) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		assertExpectedTurn(record, expected);
		const bytes = Buffer.from(data, "base64");
		if (userInput && record.tokenHash !== null) record.inputPending = bytes.toString() !== "\x03";
		await record.process.input(bytes);
		return null;
	}
	deliver(id: string, messageId: string, data: string, requireIdle = false) {
		const record = this.get(id);
		if (requireIdle && !record.ledger.has(messageId)) {
			const current = this.inspect(id);
			if (
				record.inputPending ||
				!current.controllable ||
				!current.activity ||
				!["ready", "idle"].includes(current.activity.state)
			)
				throw Object.assign(new Error("The agent is not idle"), { code: "RUNTIME_BUSY" });
		}
		return record.ledger.deliver(messageId, data, () => {
			record.inputPending = true;
			return this.input(id, data);
		});
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
				inputPending: false,
				...sessionResources(this.home, id),
				stopped: Promise.resolve(),
				resolveStop: () => {},
			};
			this.records.set(id, record);
			this.save(record);
		}
		const record = this.get(id);
		if (record.process) {
			record.process.stop();
			await record.stopped;
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
