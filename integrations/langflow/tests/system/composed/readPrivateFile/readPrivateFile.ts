import assert from "node:assert/strict";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function readPrivateFile(path: string) {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await file.stat();
		assert.ok(stat.isFile(), "private_input_not_file");
		assert.equal(stat.mode & 0o777, 0o600, "private_input_mode_must_be_0600");
		assert.equal(stat.uid, process.getuid!(), "private_input_owner_mismatch");
		return await file.readFile();
	} finally {
		await file.close();
	}
}
