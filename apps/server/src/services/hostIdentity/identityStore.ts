import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { UlidSchema } from "@trellis/api/schemas";
import { ulid } from "ulid";

export const readOrCreateIdentity = async (path: string): Promise<string> => {
	await mkdir(dirname(path), { recursive: true });
	const id = ulid();
	try {
		await writeFile(path, `${id}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
		return id;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		return UlidSchema.parse((await readFile(path, "utf8")).trim());
	}
};
