import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { type HandoffOperations, handoffOperations } from "./operations.ts";
import type { StandaloneCandidate } from "./types.ts";

export type { StandaloneCandidate } from "./types.ts";
export const inspectStandaloneCandidate = async (
	path: string,
	operations: HandoffOperations = handoffOperations,
): Promise<StandaloneCandidate> => {
	const home = realpathSync(path);
	if (!existsSync(join(home, "db", "PG_VERSION")) || lstatSync(join(home, "db")).isSymbolicLink())
		throw new Error(`Home ${home} must contain its own db/PG_VERSION.`);
	for (const marker of ["import-in-progress.json", "standalone-handoff-in-progress.json"])
		if (existsSync(join(home, marker))) throw new Error(`Home ${home} has an incomplete operation: ${marker}.`);
	const lock = join(home, "trellis.lock");
	if (!existsSync(lock) || lstatSync(lock).isSymbolicLink())
		throw new Error(`Home ${home} needs a regular trellis.lock ownership file.`);
	const owner = JSON.parse(readFileSync(lock, "utf8"));
	if (!owner || typeof owner !== "object" || !Number.isSafeInteger(owner.pid) || owner.pid < 1)
		throw new Error(`Home ${home} has invalid ownership metadata.`);
	const runtime = join(home, "runtime");
	if (existsSync(runtime) && lstatSync(runtime).isSymbolicLink())
		throw new Error(`Runtime directory ${runtime} must not be a symlink.`);
	const manifest = join(runtime, "manifest.json");
	if (existsSync(manifest)) {
		if (!lstatSync(manifest).isFile()) throw new Error(`Runtime manifest ${manifest} must be a regular file.`);
		const owner = JSON.parse(readFileSync(manifest, "utf8"));
		if (!owner || typeof owner !== "object" || !Number.isSafeInteger(owner.pid) || owner.pid < 1)
			throw new Error(`Runtime manifest ${manifest} has invalid ownership metadata.`);
		if (operations.alive(owner.pid))
			throw new Error(`Runtime owner ${owner.pid} is live. Stop it before this handoff.`);
	}
	if (existsSync(join(runtime, "runtime.sock")))
		throw new Error(
			`Runtime socket ${join(runtime, "runtime.sock")} has no confirmed owner. Reconcile it before this handoff.`,
		);
	const sessions = join(runtime, "sessions");
	if (existsSync(sessions)) {
		if (lstatSync(sessions).isSymbolicLink())
			throw new Error(`Runtime session directory ${sessions} must not be a symlink.`);
		for (const file of readdirSync(sessions).filter((name) => name.endsWith(".session.json"))) {
			const item = join(sessions, file);
			if (!lstatSync(item).isFile()) throw new Error(`Runtime record ${item} must be a regular file.`);
			const record = JSON.parse(readFileSync(item, "utf8"));
			const session = record?.session;
			if (!session || typeof session.id !== "string" || typeof session.status !== "string")
				throw new Error(`Runtime record ${item} has invalid session metadata.`);
			if (session.status !== "exited")
				throw new Error(
					`Runtime session ${session.id} is ${session.status}. Stop or reconcile it before this handoff.`,
				);
		}
	}
	let service: StandaloneCandidate["service"] = null;
	if (operations.alive(owner.pid)) {
		const domain = `gui/${process.getuid!()}`;
		const serviceOwner = await operations.launchdOwner(domain);
		if (
			owner.role !== "server" ||
			!serviceOwner ||
			serviceOwner.pid !== owner.pid ||
			!serviceOwner.home ||
			realpathSync(serviceOwner.home) !== home
		)
			throw new Error(
				`Home ${home} has an unknown live owner ${owner.pid}. Only its matching com.trellis.server service can be handed off.`,
			);
		service = { label: "com.trellis.server", domain, pid: serviceOwner.pid, port: owner.port };
	}
	return { home, backupPath: join(home, "backups", `desktop-handoff-${randomUUID()}`), service };
};
