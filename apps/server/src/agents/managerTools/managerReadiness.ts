import { randomUUID } from "node:crypto";
import { type FSWatcher, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const receipt = z.object({ attemptId: z.string(), token: z.string() });

export const managerReadiness = {
	record(path: string, attemptId: string, token: string) {
		const temporary = `${path}.${randomUUID()}.tmp`;
		writeFileSync(temporary, JSON.stringify({ attemptId, token }), { mode: 0o600 });
		renameSync(temporary, path);
	},
	wait(path: string, attemptId: string, token: string): Promise<boolean> {
		return new Promise((resolve) => {
			let watcher: FSWatcher | undefined;
			let deadline: ReturnType<typeof setTimeout> | undefined;
			const finish = (ready: boolean) => {
				clearTimeout(deadline);
				watcher?.close();
				resolve(ready);
			};
			const inspect = () => {
				try {
					const parsed = receipt.safeParse(JSON.parse(readFileSync(path, "utf8")));
					finish(parsed.success && parsed.data.attemptId === attemptId && parsed.data.token === token);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") finish(false);
				}
			};
			try {
				watcher = watch(dirname(path), inspect);
			} catch {
				finish(false);
				return;
			}
			watcher.once("error", () => finish(false));
			deadline = setTimeout(() => finish(false), 6000);
			inspect();
		});
	},
};
