import { closeSync, fsyncSync, openSync, writeFileSync } from "node:fs";
export const syncDirectory = (path: string) => {
	const fd = openSync(path, "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
};
export const writeJson = (path: string, value: unknown, exclusive = false) =>
	writeFileSync(path, JSON.stringify(value), { mode: 0o600, flag: exclusive ? "wx" : "w", flush: true });
