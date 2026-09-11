import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const script = `activate
try
 return POSIX path of (choose folder with prompt "Select the project directory for Trellis")
on error number -128
 return ""
end try`;

export async function chooseDirectory(
	run: (file: string, args: string[]) => Promise<{ stdout: string }> = execute,
): Promise<string | null> {
	const { stdout } = await run("/usr/bin/osascript", ["-e", script]);
	return stdout.replace(/\r?\n$/, "") || null;
}
