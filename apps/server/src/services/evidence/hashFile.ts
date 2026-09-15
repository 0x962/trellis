import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";

export const hashFile = async (source: string | FileHandle) => {
	const handle = typeof source === "string" ? await open(source, constants.O_RDONLY | constants.O_NOFOLLOW) : source;
	try {
		const hash = createHash("sha256");
		const buffer = Buffer.allocUnsafe(64 * 1024);
		let position = 0;
		while (true) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
			if (bytesRead === 0) break;
			hash.update(buffer.subarray(0, bytesRead));
			position += bytesRead;
		}
		return hash.digest("hex");
	} finally {
		if (typeof source === "string") await handle.close();
	}
};
