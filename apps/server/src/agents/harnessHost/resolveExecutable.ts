import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

export async function resolveExecutable(name: string, path: string): Promise<string> {
	for (const directory of path.split(delimiter).filter(Boolean)) {
		const candidate = join(directory, name);
		try {
			await access(candidate, constants.X_OK);
			if ((await stat(candidate)).isFile()) return candidate;
		} catch (error) {
			if (!["ENOENT", "EACCES", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code!)) throw error;
		}
	}
	throw Object.assign(new Error(`Harness executable ${name} was not found on PATH: ${path}`), {
		code: "HARNESS_NOT_INSTALLED",
	});
}
