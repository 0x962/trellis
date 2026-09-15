import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";

export const defaultDesktopUserData = () => join(userInfo().homedir, "Library/Application Support/Trellis");

export type SelectedHome = { version: 1; home: string };

export const readSelectedHome = (userData: string): string => {
	const path = join(userData, "selected-home.json");
	if (!existsSync(path)) {
		const home = join(userData, "host");
		return existsSync(home) ? realpathSync(home) : home;
	}
	const selected: SelectedHome | null = JSON.parse(readFileSync(path, "utf8"));
	if (selected === null || selected.version !== 1 || typeof selected.home !== "string" || !isAbsolute(selected.home))
		throw new Error(`The selected Trellis data directory is invalid. Review ${path}.`);
	const home = realpathSync(selected.home);
	if (!statSync(home).isDirectory()) throw new Error(`The selected Trellis data directory is invalid. Review ${path}.`);
	return home;
};

export const writeSelectedHome = async (userData: string, home: string): Promise<void> => {
	const selected: SelectedHome = { version: 1, home: await realpath(home) };
	if (!(await stat(selected.home)).isDirectory()) throw new Error(`${home} is not a directory.`);
	await mkdir(userData, { recursive: true, mode: 0o700 });
	const pending = join(userData, `.selected-home-${randomUUID()}.tmp`);
	try {
		await writeFile(pending, JSON.stringify(selected), { mode: 0o600, flag: "wx" });
		await rename(pending, join(userData, "selected-home.json"));
	} finally {
		await rm(pending, { force: true });
	}
};
