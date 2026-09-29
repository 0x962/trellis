export type OciCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type OciRun = (args: string[]) => Promise<OciCommandResult>;

export async function runOciCommand(executable: string, args: string[]): Promise<OciCommandResult> {
	const process = Bun.spawn([executable, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

export function missingOciObject(result: OciCommandResult) {
	return result.exitCode === 1 && /no such (object|container|network|volume)/i.test(result.stderr);
}
