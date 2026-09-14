import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchSpec, RuntimeSession } from "@trellis/runtime-protocol";
import { InputLedger } from "./inputLedger.ts";
import { createProcessHandle, type ProcessHandle } from "./processHandle.ts";
import { SessionLog } from "./sessionLog.ts";

type Record = {
	session: RuntimeSession;
	fingerprint: string | null;
	log: SessionLog;
	stderr: SessionLog;
	ledger: InputLedger;
	process?: ProcessHandle;
	timer?: ReturnType<typeof setTimeout>;
	stopped: Promise<void>;
	resolveStop: () => void;
};
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
			};
			if (saved.session.status === "running") saved.session.status = "unknown";
			const record = {
				...saved,
				log: new SessionLog(join(home, `${saved.session.id}.output.json`)),
				stderr: new SessionLog(join(home, `${saved.session.id}.stderr.json`)),
				ledger: new InputLedger(join(home, `${saved.session.id}.input.json`)),
				stopped: Promise.resolve(),
				resolveStop: () => {},
			};
			this.records.set(saved.session.id, record);
			this.save(record);
		}
	}
	private save(record: Record) {
		const path = join(this.home, `${record.session.id}.session.json`);
		writeFileSync(`${path}.tmp`, JSON.stringify({ session: record.session, fingerprint: record.fingerprint }), {
			mode: 0o600,
		});
		renameSync(`${path}.tmp`, path);
	}
	private get(id: string) {
		const record = this.records.get(id);
		if (!record) throw Object.assign(new Error(`Session ${id} does not exist`), { code: "SESSION_NOT_FOUND" });
		return record;
	}
	list() {
		return [...this.records.values()].map((record) => record.session);
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
			return existing.session;
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
			log: new SessionLog(join(this.home, `${spec.id}.output.json`)),
			stderr: new SessionLog(join(this.home, `${spec.id}.stderr.json`)),
			ledger: new InputLedger(join(this.home, `${spec.id}.input.json`)),
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
			return session;
		}
		session.pid = record.process.pid;
		session.status = "running";
		this.save(record);
		if (spec.timeoutMs !== undefined)
			record.timer = setTimeout(() => {
				session.error = `Process timed out after ${spec.timeoutMs} ms`;
				this.save(record);
				record.process!.stop();
			}, spec.timeoutMs);
		return session;
	}
	async input(id: string, data: string) {
		const record = this.get(id);
		if (!record.process) throw new Error(`Session ${id} is ${record.session.status}`);
		await record.process.input(Buffer.from(data, "base64"));
		return null;
	}
	deliver(id: string, messageId: string, data: string) {
		return this.get(id).ledger.deliver(messageId, data, () => this.input(id, data));
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
				log: new SessionLog(join(this.home, `${id}.output.json`)),
				stderr: new SessionLog(join(this.home, `${id}.stderr.json`)),
				ledger: new InputLedger(join(this.home, `${id}.input.json`)),
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
		return record.session;
	}
	output(id: string, offset: number, stream: "stdout" | "stderr" = "stdout") {
		return (stream === "stderr" ? this.get(id).stderr : this.get(id).log).read(offset);
	}
	async stopAll() {
		await Promise.all(
			this.list()
				.filter((session) => session.status === "running")
				.map((session) => this.stop(session.id)),
		);
	}
}
