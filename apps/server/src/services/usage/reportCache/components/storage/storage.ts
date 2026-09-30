import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UsageDays, UsageReport } from "@trellis/api";

const directory = (home: string) => join(home, "cache", "usage-reports-v1");
const path = (home: string, days: UsageDays) => join(directory(home), `${days}.json`);

export const reportStorage = {
	async read(home: string, days: UsageDays): Promise<UsageReport | undefined> {
		const bytes = await readFile(path(home, days), "utf8").catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return undefined;
			throw error;
		});
		return bytes === undefined ? undefined : JSON.parse(bytes);
	},
	async write(home: string, days: UsageDays, report: UsageReport) {
		await mkdir(directory(home), { recursive: true, mode: 0o700 });
		const temporary = `${path(home, days)}.partial`;
		try {
			await writeFile(temporary, JSON.stringify(report), { mode: 0o600 });
			await rename(temporary, path(home, days));
		} finally {
			await rm(temporary, { force: true });
		}
	},
	remove: (home: string) => rm(directory(home), { recursive: true, force: true }),
};
