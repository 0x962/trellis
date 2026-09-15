import { parseClaudeStatus } from "./parseClaudeStatus.ts";

export async function readClaudeStatus(target: { sessionId: string; pid: number }, executable = "claude") {
	const process = Bun.spawn([executable, "agents", "--json"], { stdout: "pipe", stderr: "pipe" });
	const [output, error, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) throw new Error(`Claude status failed (${exitCode}): ${error}`);
	return parseClaudeStatus(JSON.parse(output), target);
}
