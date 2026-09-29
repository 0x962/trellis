import { open } from "node:fs/promises";

export async function syncDirectory(path: string) {
	const directory = await open(path, "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}
