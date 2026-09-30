import { open } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "../syncDirectory";

export async function writeCaptureRecord(path: string, value: unknown) {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(value));
		await file.sync();
	} finally { await file.close(); }
	await syncDirectory(dirname(path));
}
