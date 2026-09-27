import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const writeAtomicJson = async (path: string, value: unknown): Promise<void> => {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const pending = join(directory, `.${randomUUID()}.tmp`);
	try {
		await writeFile(pending, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
		await rename(pending, path);
	} finally {
		await rm(pending, { force: true });
	}
};
