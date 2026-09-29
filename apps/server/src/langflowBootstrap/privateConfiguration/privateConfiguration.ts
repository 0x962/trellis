import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

export async function readPrivateConfiguration(filePath: string): Promise<Buffer> {
	if (!isAbsolute(filePath)) throw new Error("langflow_configuration_path_invalid");
	const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const metadata = await file.stat();
		if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== process.getuid!())
			throw new Error("langflow_configuration_not_private");
		return await file.readFile();
	} finally {
		await file.close();
	}
}
