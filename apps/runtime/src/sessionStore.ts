import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchSpec, RuntimeMethods, RuntimeProcessStatus, RuntimeSession } from "@trellis/runtime-protocol";
import { CompletionStore } from "./completionStore.ts";
import { InputLedger } from "./inputLedger.ts";
import { inspectProcess } from "./inspectProcess.ts";
import { observedSession } from "./observedSession.ts";
import { createProcessHandle } from "./processHandle.ts";
import { SessionLog } from "./sessionLog.ts";
import type { SessionRecord as Record } from "./sessionRecord.ts";

export class SessionStore {
	private readonly records = new Map<string, Record>();
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
			const record = {
				...saved,
				identity: saved.identity ?? null,
				launch: saved.launch ?? null,
				listeners: new Set<() => void>(),
				tokenHash: null,
				activity: null,
				log: new SessionLog(join(home, `${saved.session.id}.output.json`)),
				stderr: new SessionLog(join(home, `${saved.session.id}.stderr.json`)),
				ledger: new InputLedger(join(home, `${saved.session.id}.input.json`)),
				completion: new CompletionStore(join(home, `${saved.session.id}.results.jsonl`)),
				stopped: Promise.resolve(),
				resolveStop: () => {},
			};
			this.records.set(saved.session.id, record);
			this.save(record);
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
	list() {
		return [...this.records.keys()].map((id) => this.inspect(id));
	}
	inspect(id: string): RuntimeProcessStatus {
		const record = this.get(id);
		const observation = record.session.pid === null ? { kind: "missing" as const } : inspectProcess(record.session.pid);
		return {
			...record.session,
			...observedSession(record.session, record.identity, observation, record.process !== undefined),
			checkedAt: new Date().toISOString(),
			launch: record.launch,
			activity: record.activity,
			acknowledgedMessageIds: record.ledger.acknowledgedMessageIds(),
			result: record.completion.latest,
		};
	}
	turn({ id, token, event, messageId, result }: RuntimeMethods["turn"]["params"]): RuntimeProcessStatus {
		const record = this.get(id);
		if (record.tokenHash === null || !timingSafeEqual(record.tokenHash, createHash("sha256").update(token).digest()))
			throw new Error("The attempt token does not match this process");
		if (!this.inspect(id).controllable) throw new Error("The process is not controllable");
		const state = { SessionStart: "ready", UserPromptSubmit: "working", Stop: "idle" } as const;
		record.activity = { state: state[event], updatedAt: new Date().toISOString() };
		if (event === "UserPromptSubmit" && messageId !== undefined) record.ledger.acknowledge(messageId, messageId === id);
		if (event === "Stop" && result !== undefined) record.completion.append(result);
		for (const listener of record.listeners) listener();
		return this.inspect(id);
	}
	subscribe(id: string, listener: () => void, stream: "stdout" | "stderr" = "stdout") {
		const record = this.get(id);
		record.listeners.add(listener);
		const unsubscribe = (stream === "stderr" ? record.stderr : record.log).subscribe(listener);
		return () => {
			record.listeners.delete(listener);
			unsubscribe();
		};
	}
	start(spec: LaunchSpec): RuntimeSession {
		const fingerprint = createHash("sha256")
			.update(
				JSON.stringify([
					spec.command,
					spec.args,
					spec.cwd,
					spec.mode,
					Object.entries(spec.env ?? {}).sort(),
					spec.cols ?? 80,
					spec.rows ?? 24,
					spec.separateStderr ?? false,
					spec.timeoutMs ?? null,
				]),
			)
			.digest("hex");
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
			tokenHash: spec.env?.TRELLIS_ATTEMPT_TOKEN
				? createHash("sha256").update(spec.env.TRELLIS_ATTEMPT_TOKEN).digest()
				: null,
			activity: null,
			log: new SessionLog(join(this.home, `${spec.id}.output.json`)),
			stderr: new SessionLog(join(this.home, `${spec.id}.stderr.json`)),
			ledger: new InputLedger(join(this.home, `${spec.id}.input.json`)),
			completion: new CompletionStore(join(this.home, `${spec.id}.results.jsonl`)),
			stopped,
			resolveStop,
		};
		this.records.set(spec.id, record);
		this.save(record);
		const exit = (code: number | null, error: string | null = session.error) => {
			clearTimeout(record.timer);
			session.status = "exited";
			session.exitCode = code;
			session.error = error;
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
	async input(id: string, data: string) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		if (record.tokenHash !== null) {
			record.activity = { state: "working", updatedAt: new Date().toISOString() };
			for (const listener of record.listeners) listener();
		}
		await record.process.input(Buffer.from(data, "base64"));
		return null;
	}
	deliver(id: string, messageId: string, data: string, requireIdle = false) {
		const record = this.get(id);
		if (requireIdle && !record.ledger.has(messageId)) {
			const current = this.inspect(id);
			if (!current.controllable || !current.activity || !["ready", "idle"].includes(current.activity.state))
				throw Object.assign(new Error("The agent is not idle"), { code: "RUNTIME_BUSY" });
		}
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
				tokenHash: null,
				activity: null,
				log: new SessionLog(join(this.home, `${id}.output.json`)),
				stderr: new SessionLog(join(this.home, `${id}.stderr.json`)),
				ledger: new InputLedger(join(this.home, `${id}.input.json`)),
				completion: new CompletionStore(join(this.home, `${id}.results.jsonl`)),
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
	output(id: string, offset: number, stream: "stdout" | "stderr" = "stdout") {
		return (stream === "stderr" ? this.get(id).stderr : this.get(id).log).read(offset);
	}
	outputComplete(id: string) {
		return this.get(id).process === undefined;
	}
	async stopAll() {
		await Promise.all(
			this.list()
				.filter((session) => session.status === "running")
				.map((session) => this.stop(session.id)),
		);
	}
}
