import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export const POSIX_HOST_SHELL = "/bin/sh";

export const resolveHostShell = async (env: Record<string, string | undefined>): Promise<string> => {
	const shell = env.TRELLIS_EXECUTION_SHELL ?? POSIX_HOST_SHELL;
	if (!isAbsolute(shell))
		throw new Error(`TRELLIS_EXECUTION_SHELL must contain an absolute path. The value is "${shell}".`);
	if (!(await stat(shell)).isFile()) throw new Error(`The host shell path is not a file: ${shell}`);
	await access(shell, constants.X_OK);
	return shell;
};
