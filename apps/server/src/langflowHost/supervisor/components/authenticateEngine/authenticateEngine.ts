import { timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function authenticateEngine(path: string, authorization: string | null) {
	if (authorization === null) throw new Error("sidecar_authentication_denied");
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const metadata = await file.stat();
		if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== process.getuid?.()) {
			throw new Error("unsafe_sidecar_authentication");
		}
		const token = await file.readFile("utf8");
		if (!token) throw new Error("unsafe_sidecar_authentication");
		const expected = Buffer.from(`Bearer ${token}`, "utf8");
		const supplied = Buffer.from(authorization, "utf8");
		if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
			throw new Error("sidecar_authentication_denied");
		}
	} finally {
		await file.close();
	}
}
