// The Muse Session Protocol that the bridge speaks shipped in Muse Code
// 1.3.0. An older Muse has no `serve` command, so the check fails before
// any attempt file or process exists.
export async function checkMuseVersion(executable: string, cwd: string, env: Record<string, string>) {
	const command = Bun.spawn([executable, "--version"], {
		cwd,
		env: { ...env, MUSE_NO_AUTO_UPDATE: "1" },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5000,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(command.stdout).text(),
		new Response(command.stderr).text(),
		command.exited,
	]);
	if (code !== 0) throw new Error(`Muse version command failed (${code}) at ${executable}: ${stderr}`);
	const installed = stdout.trim();
	const match = /^Muse Code (\d+)\.(\d+)\.(\d+)/.exec(installed);
	if (match === null)
		throw new Error(`Muse returned an unreadable version at ${executable}: ${JSON.stringify(installed)}`);
	const [major, minor] = match.slice(1, 3).map(Number) as [number, number];
	if (major < 1 || (major === 1 && minor < 3))
		throw Object.assign(
			new Error(
				`Muse ${installed} is not supported by this host. The tested minimum is 1.3.0. Executable: ${executable}`,
			),
			{ code: "HARNESS_VERSION_UNSUPPORTED" },
		);
}
