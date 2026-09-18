import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

export type HostConnection = { origin: string; token: string; pid: number };
export type HostOptions = {
	home: string;
	executable: string;
	entry: string;
	webDist: string;
	env?: NodeJS.ProcessEnv;
};

type Owner = { pid: number; role: string; port: number | null };

const ownerAt = (home: string): Owner | undefined => {
	const path = join(home, "trellis.lock");
	if (!existsSync(path)) return;
	const text = readFileSync(path, "utf8");
	if (!text) return;
	return JSON.parse(text) as Owner;
};

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};

const healthy = async (owner: Owner | undefined, token: string): Promise<HostConnection | undefined> => {
	if (owner?.role !== "server" || !owner.port || !alive(owner.pid)) return;
	const origin = `http://127.0.0.1:${owner.port}`;
	try {
		const response = await fetch(`${origin}/api/health`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(1000),
		});
		if (response.status === 401) throw new Error("The data home uses a different host token.");
		if (response.ok) {
			const anonymous = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
			if (anonymous.status !== 401)
				throw new Error(
					"The existing host does not require desktop authentication. Complete the service migration first.",
				);
			return { origin, token, pid: owner.pid };
		}
	} catch (error) {
		if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
	}
};

const connections = new Map<string, Promise<HostConnection>>();

export const connectHost = (options: HostOptions): Promise<HostConnection> => {
	const pending = connections.get(options.home);
	if (pending) return pending;
	const connection = startHost(options).finally(() => connections.delete(options.home));
	connections.set(options.home, connection);
	return connection;
};

export const ensureHostToken = (home: string): string => {
	mkdirSync(home, { recursive: true, mode: 0o700 });
	const tokenPath = join(home, "desktop-token");
	if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
	const token = readFileSync(tokenPath, "utf8");
	return token;
};

export const assertHostStopped = (home: string) => {
	const owner = ownerAt(home);
	if (owner && alive(owner.pid)) throw new Error(`Process ${owner.pid} already owns this data home.`);
};

export const assertManagedHome = (home: string) => {
	const owner = ownerAt(home);
	if (!owner || !alive(owner.pid)) return;
	const servicePid = join(home, "desktop-service.pid");
	if (!existsSync(servicePid) || Number(readFileSync(servicePid, "utf8")) !== owner.pid)
		throw new Error("An unmanaged host owns this data home. Stop it before you enable the background service.");
};

export const waitForHostExit = async (home: string) => {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		const owner = ownerAt(home);
		if (!owner || !alive(owner.pid)) return;
		await setTimeout(100);
	}
	throw new Error("The background host still runs. Inspect the local logs before you close Trellis.");
};

export const adoptHost = async (home: string): Promise<HostConnection> => {
	const token = ensureHostToken(home);
	const deadline = Date.now() + 60000;
	while (Date.now() < deadline) {
		const connection = await healthy(ownerAt(home), token);
		if (connection) {
			assertManagedHome(home);
			return connection;
		}
		await setTimeout(100);
	}
	throw new Error(`The background service did not become ready. Read ${join(home, "desktop-host.log")}.`);
};

const startHost = async ({ home, executable, entry, webDist, env }: HostOptions): Promise<HostConnection> => {
	const token = ensureHostToken(home);
	const owner = ownerAt(home);
	const existing = await healthy(owner, token);
	if (existing) return existing;
	if (owner && alive(owner.pid)) {
		const deadline = Date.now() + 60000;
		while (Date.now() < deadline && alive(owner.pid)) {
			const connection = await healthy(ownerAt(home), token);
			if (connection) return connection;
			await setTimeout(100);
		}
		throw new Error(`Process ${owner.pid} did not become ready. Inspect ${join(home, "server.log")}.`);
	}
	const logPath = join(home, "desktop-host.log");
	// The host appends to this file for its whole life. A host start moves a
	// file past 10 MB aside, so the log holds two files at most.
	if (existsSync(logPath) && statSync(logPath).size > 10 * 1024 * 1024) renameSync(logPath, `${logPath}.1`);
	const log = openSync(logPath, "a", 0o600);
	const child = spawn(executable, [entry], {
		detached: true,
		stdio: ["ignore", log, log],
		env: {
			...process.env,
			...env,
			TRELLIS_HOME: home,
			TRELLIS_HOST: "127.0.0.1",
			TRELLIS_PORT: owner?.role === "server" && owner.port ? String(owner.port) : "0",
			TRELLIS_AUTH_TOKEN: token,
			TRELLIS_WEB_DIST: webDist,
		},
	});
	closeSync(log);
	let failure: Error | undefined;
	child.once("error", (error) => {
		failure = error;
	});
	child.unref();
	const deadline = Date.now() + 60000;
	while (Date.now() < deadline) {
		if (failure) throw failure;
		const connection = await healthy(ownerAt(home), token);
		if (connection) return connection;
		if (child.exitCode !== null) throw new Error(`The host exited with code ${child.exitCode}. Read ${logPath}.`);
		await setTimeout(100);
	}
	throw new Error(`The host did not become ready within 60 seconds. Read ${logPath}.`);
};
