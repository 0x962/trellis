import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { recoveryName } from "../manifest";

export async function assertRestoreReconciled(directory: string) {
	const marker = await lstat(join(directory, recoveryName)).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	if (marker) throw new Error("restore_requires_reconciliation");
}
