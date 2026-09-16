export async function checkCodexManagerVersion(executable: string, cwd: string, env: Record<string, string>) {
	const command = Bun.spawn([executable, "--version"], { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 5000 });
	const [output, error, status] = await Promise.all([
		new Response(command.stdout).text(),
		new Response(command.stderr).text(),
		command.exited,
	]);
	if (status !== 0) throw new Error(`Codex version command failed (${status}): ${error}`);
	const match = /^codex-cli (\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(output.trim());
	if (!match) throw new Error(`Codex returned an unreadable version: ${JSON.stringify(output.trim())}`);
	const [major, minor] = match.slice(1, 3).map(Number) as [number, number];
	if (major === 0 && minor < 154)
		throw new Error(`Codex managers require version 0.154.0 or later. Installed: ${output.trim()}`);
}
