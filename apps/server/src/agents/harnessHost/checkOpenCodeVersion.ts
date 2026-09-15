export async function checkOpenCodeVersion(executable: string, cwd: string, env: Record<string, string>) {
	const command = Bun.spawn([executable, "--version"], {
		cwd,
		env: { ...env, OPENCODE_DISABLE_AUTOUPDATE: "1" },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5000,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(command.stdout).text(),
		new Response(command.stderr).text(),
		command.exited,
	]);
	if (code !== 0) throw new Error(`OpenCode version command failed (${code}) at ${executable}: ${stderr}`);
	const installed = stdout.trim();
	const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(installed);
	if (match === null)
		throw new Error(`OpenCode returned an unreadable version at ${executable}: ${JSON.stringify(installed)}`);
	const [major, minor, patch] = match.slice(1, 4).map(Number) as [number, number, number];
	if (major < 1 || (major === 1 && (minor < 18 || (minor === 18 && patch < 31))))
		throw Object.assign(
			new Error(
				`OpenCode ${installed} is not supported by this host. The tested minimum is 1.18.31. Executable: ${executable}`,
			),
			{ code: "HARNESS_VERSION_UNSUPPORTED" },
		);
}
