import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { invalidInput } from "../../errors.ts";

const execute = promisify(execFile);
const script = `activate
try
 return POSIX path of (choose folder with prompt "Select the project directory for Trellis")
on error number -128
 return ""
end try`;

// Opens the folder picker of the computer and answers the path the person
// selected, or null when they cancel. osascript is a program outside the
// server, so a failure to open the dialog is a boundary failure. Its text
// becomes a refusal on the `directory` input, so the person who called
// system.chooseDirectory reads why no dialog appeared.
export async function chooseDirectory(
	run: (file: string, args: string[]) => Promise<{ stdout: string }> = execute,
): Promise<string | null> {
	const { stdout } = await run("/usr/bin/osascript", ["-e", script]).catch((cause: Error) => {
		throw invalidInput("directory", `The folder picker did not open: ${cause.message}`);
	});
	return stdout.replace(/\r?\n$/, "") || null;
}
