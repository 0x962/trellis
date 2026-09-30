import { fail } from "../../errors.ts";
import type { ExecutionEnvironment } from "../../executionEnvironment";

// A copy or archive command can fail at the filesystem boundary.
// The error includes the tool, exit status, and stderr for the person who requests the backup.
export const backupCommand = async (command: string[], env: ExecutionEnvironment) => {
	const proc = Bun.spawn(command, { env, stdout: "ignore", stderr: "pipe" });
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	if (code !== 0) {
		const text = stderr.trim();
		throw fail("BACKUP_FAILED", { command: command[0]!, code, stderr: text }, `${command[0]} exited ${code}: ${text}`);
	}
};
