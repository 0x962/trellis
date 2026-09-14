import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
export const assertNoLiveProcesses = (home: string) => {
	const folder = join(home, "runtime", "sessions");
	if (!existsSync(folder)) return;
	if (lstatSync(folder).isSymbolicLink()) throw new Error(`Runtime session directory ${folder} must not be a symlink.`);
	for (const file of readdirSync(folder).filter((path) => path.endsWith(".session.json"))) {
		if (!lstatSync(join(folder, file)).isFile()) throw new Error(`Runtime session ${file} must be a regular file.`);
		const { session } = JSON.parse(readFileSync(join(folder, file), "utf8")) as {
			session: { id: string; pid: number | null; status: string };
		};
		if (session.status === "exited") continue;
		if (session.pid !== null) {
			try {
				process.kill(session.pid, 0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ESRCH")
					throw new Error(
						`Runtime session ${session.id} has an unresolved process record. Reconcile it before import or rollback.`,
					);
				throw error;
			}
		}
		throw new Error(
			`Runtime session ${session.id} still records process ${session.pid}. Stop or reconcile it before import or rollback.`,
		);
	}
};
