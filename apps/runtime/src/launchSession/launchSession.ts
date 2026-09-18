import type { LaunchSpec } from "@trellis/runtime-protocol";
import { inspectProcess } from "../inspectProcess.ts";
import { createProcessHandle } from "../processHandle.ts";
import type { SessionRecord } from "../sessionRecord.ts";
import { stopAttempt } from "../stopAttempt.ts";

// `save` writes the session record after each change of its state. `onExit`
// runs once the exit is final, after the record is saved and the stop
// promise is resolved.
export function launchSession(record: SessionRecord, spec: LaunchSpec, save: () => void, onExit: () => void) {
	const { session, log, stderr } = record;
	let cleanupError: string | null = null;
	const resume = () => {
		if (log.writable && stderr.writable) record.process?.resumeOutput();
	};
	log.onDrain(resume);
	stderr.onDrain(resume);
	const exit = (code: number | null, error: string | null = session.error) => {
		clearTimeout(record.timer);
		const finish = () => {
			session.status = "exited";
			session.exitCode = code;
			session.error =
				(error === cleanupError ? null : error) ??
				(code !== null && code !== 0 ? `Process ${spec.command} exited with code ${code}` : null);
			session.endedAt = new Date().toISOString();
			record.process = undefined;
			save();
			record.resolveStop();
			onExit();
		};
		const drained = Promise.all([log.finish(), stderr.finish()]);
		if (log.complete && stderr.complete) finish();
		else void drained.then(finish);
	};
	try {
		record.process = createProcessHandle(
			spec,
			(data) => {
				if (!log.append(data)) record.process!.pauseOutput();
			},
			(data) => {
				if (!stderr.append(data)) record.process!.pauseOutput();
			},
			(code) => exit(code),
			(error) => exit(null, error.message),
			(error) => {
				clearTimeout(record.timer);
				session.status = "unknown";
				cleanupError = `Process cleanup is unconfirmed: ${error.message}`;
				session.error = cleanupError;
				save();
				record.resolveStop(error);
				Object.assign(record, stopAttempt());
			},
			(error) => {
				session.error = `Input delivery is unconfirmed: ${error.message}`;
				save();
			},
		);
	} catch (error) {
		exit(null, (error as Error).message);
		return;
	}
	session.pid = record.process.pid > 0 ? record.process.pid : null;
	const observation = session.pid === null ? { kind: "missing" as const } : inspectProcess(session.pid);
	if (observation.kind === "live") record.identity = observation.process.identity;
	session.status = "running";
	save();
	if (spec.timeoutMs !== undefined)
		record.timer = setTimeout(() => {
			session.error = `Process timed out after ${spec.timeoutMs} ms`;
			save();
			record.process!.stop();
		}, spec.timeoutMs);
}
