import { existsSync } from "node:fs";
import { join } from "node:path";

export const assertStandaloneHandoffReady = (home: string) => {
	if (existsSync(join(home, "standalone-handoff-in-progress.json")))
		throw new Error(
			`Standalone handoff is incomplete at ${home}. Keep its backup and review standalone-handoff-in-progress.json before another startup.`,
		);
};
