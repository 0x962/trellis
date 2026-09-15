import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HostConnection } from "../host/host.ts";

export type CurrentService = { host: HostConnection | null; runtimeActive: boolean };
const alive = (pid: number) => {
	if (!Number.isInteger(pid) || pid <= 0) throw new Error("The current data directory has an invalid process owner.");
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));

export const inspectCurrentService = async (home: string): Promise<CurrentService> => {
	const lock = join(home, "trellis.lock");
	const owner = existsSync(lock) ? await read(lock) : null;
	if (existsSync(lock) && (owner === null || typeof owner !== "object"))
		throw new Error("The current host owner record is invalid. Inspect it before changing directories.");
	const servicePath = join(home, "desktop-service.pid");
	const servicePid = existsSync(servicePath) ? Number(await readFile(servicePath, "utf8")) : null;
	const ownerAlive = owner !== null && alive(owner.pid);
	if (servicePid !== null && alive(servicePid) && (!ownerAlive || owner.pid !== servicePid))
		throw new Error(
			"The background service has no confirmed host owner. Wait for it to start, then reconnect before changing directories.",
		);
	const manifest = join(home, "runtime/manifest.json");
	let runtimeActive = false;
	if (existsSync(manifest)) runtimeActive = alive((await read(manifest)).pid);
	else if (existsSync(join(home, "runtime/runtime.sock")))
		throw new Error(
			"The execution service has no owner record. Inspect the current data directory before changing it.",
		);
	const sessions = join(home, "runtime/sessions");
	if (existsSync(sessions)) {
		for (const file of await readdir(sessions)) {
			if (!file.endsWith(".session.json")) continue;
			const status = (await read(join(sessions, file))).session?.status;
			if (status !== "exited") runtimeActive = true;
		}
	}
	if (!ownerAlive) return { host: null, runtimeActive };
	if (
		owner.pid !== servicePid ||
		owner.role !== "server" ||
		!Number.isInteger(owner.port) ||
		owner.port < 1 ||
		owner.port > 65535
	)
		throw new Error(
			"An unknown live owner holds the current data directory. Reconnect to its host before changing directories.",
		);
	const tokenPath = join(home, "desktop-token");
	if (!existsSync(tokenPath))
		throw new Error("The current host has no desktop token. Inspect its service before changing directories.");
	const token = await readFile(tokenPath, "utf8");
	const origin = `http://127.0.0.1:${owner.port}`;
	try {
		const response = await fetch(`${origin}/api/health`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(1000),
		});
		const anonymous = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
		if (!response.ok || anonymous.status !== 401)
			throw new Error("The current host does not confirm desktop authentication.");
	} catch (error) {
		throw new Error(
			`The current host cannot be verified. Reconnect before changing directories: ${(error as Error).message}`,
		);
	}
	const confirmed = await read(lock);
	if (confirmed.pid !== owner.pid || confirmed.port !== owner.port || confirmed.role !== "server" || !alive(owner.pid))
		throw new Error("The current host owner changed during inspection. Reconnect before changing directories.");
	return { host: { pid: owner.pid, origin, token }, runtimeActive };
};
