import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";

export const hashFile = async (source: string | FileHandle) => {
	const handle = typeof source === "string" ? await open(source, constants.O_RDONLY | constants.O_NOFOLLOW) : source;
	try {
		const hash = createHash("sha256");
		for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
		return hash.digest("hex");
	} finally {
		if (typeof source === "string") await handle.close();
	}
};
