import childProcess from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";

const execute = childProcess.execFileSync;
childProcess.execFileSync = function (file, ...args) {
	const marker = join(process.argv.at(-1), "fail-cleanup");
	if (file === "/bin/ps" && existsSync(marker)) {
		unlinkSync(marker);
		throw Object.assign(new Error("spawnSync /bin/ps ETIMEDOUT"), { code: "ETIMEDOUT" });
	}
	return execute.call(this, file, ...args);
};
syncBuiltinESMExports();
