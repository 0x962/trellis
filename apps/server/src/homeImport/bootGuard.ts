import { existsSync } from "node:fs";
import { join } from "node:path";
export const assertHomeImportReady = (home: string) => {
	if (existsSync(join(home, "import-in-progress.json")))
		throw new Error(
			`Home import is incomplete at ${home}. Archive this target with trellis home-import rollback before another import.`,
		);
};
