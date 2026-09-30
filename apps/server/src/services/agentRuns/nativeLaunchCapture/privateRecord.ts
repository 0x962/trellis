import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function readPrivateRecord<T>(path: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return undefined;
	}
}

export async function createPrivateRecord<T>(path: string, value: T): Promise<T> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = join(dirname(path), `${randomUUID()}.partial`);
	const file = await open(temporary, "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(value));
		await file.sync();
	} finally {
		await file.close();
	}
	try {
		await link(temporary, path);
		const directory = await open(dirname(path), "r");
		try {
			await directory.sync();
		} finally {
			await directory.close();
		}
		return value;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		return (await readPrivateRecord<T>(path))!;
	} finally {
		await unlink(temporary);
	}
}
