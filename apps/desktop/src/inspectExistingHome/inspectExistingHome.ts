import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

export type ExistingHome = {
	home: string;
	owner: { pid: number; role: string; port: number | null } | null;
	runtime: { pid: number; version: number } | null;
};

const live = (pid: number) => {
	if (!Number.isInteger(pid) || pid <= 0) throw new Error("The data directory has an invalid process owner.");
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
		throw error;
	}
};

export const inspectExistingHome = async (path: string): Promise<ExistingHome> => {
	const home = await realpath(path);
	if (
		!(await stat(home)).isDirectory() ||
		!existsSync(join(home, "db/PG_VERSION")) ||
		!existsSync(join(home, "trellis.lock"))
	)
		throw new Error(`${home} does not contain a Trellis database and ownership file.`);
	const record = JSON.parse(await readFile(join(home, "trellis.lock"), "utf8"));
	if (
		typeof record.role !== "string" ||
		(record.port !== null && (!Number.isInteger(record.port) || record.port <= 0 || record.port > 65535))
	)
		throw new Error(`The host ownership record is invalid in ${home}.`);
	const owner = live(record.pid) ? { pid: record.pid, role: record.role, port: record.port } : null;
	let runtime: ExistingHome["runtime"] = null;
	const manifest = join(home, "runtime/manifest.json");
	if (existsSync(manifest)) {
		const record = JSON.parse(await readFile(manifest, "utf8"));
		if (!Number.isInteger(record.version) || record.version <= 0)
			throw new Error(`The runtime owner record is invalid in ${home}.`);
		if (live(record.pid)) runtime = { pid: record.pid, version: record.version };
	} else if (existsSync(join(home, "runtime/runtime.sock"))) {
		throw new Error(`The execution service in ${home} has no owner record.`);
	}
	return { home, owner, runtime };
};
