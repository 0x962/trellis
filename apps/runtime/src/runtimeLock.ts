import { closeSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { flockSync } from "fs-ext";

export async function acquireRuntimeLock(home: string) {
	const fd = openSync(join(home, "runtime.lock"), "a", 0o600);
	try {
		flockSync(fd, "exnb");
	} catch (error) {
		closeSync(fd);
		throw error;
	}
	const socketPath = join(home, "runtime.sock");
	try {
		if (existsSync(socketPath)) {
			const code = await new Promise<string>((resolve, reject) => {
				const socket = createConnection(socketPath);
				socket.once("connect", () => {
					socket.destroy();
					reject(new Error("A runtime still owns this socket"));
				});
				socket.once("error", (error) => resolve((error as NodeJS.ErrnoException).code!));
			});
			if (code !== "ECONNREFUSED") throw new Error(`Cannot establish runtime socket ownership: ${code}`);
			const manifest = JSON.parse(readFileSync(join(home, "manifest.json"), "utf8")) as { pid: number };
			try {
				process.kill(manifest.pid, 0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
				rmSync(socketPath);
				return () => closeSync(fd);
			}
			throw new Error(`Runtime PID ${manifest.pid} still exists; socket ownership needs inspection`);
		}
		return () => closeSync(fd);
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}
