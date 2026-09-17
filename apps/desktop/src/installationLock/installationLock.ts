export async function withInstallationLock<T>(path: string, publish: () => Promise<T>): Promise<T> {
	const child = Bun.spawn(["/usr/bin/lockf", "-k", "-t", "0", path, "/bin/sh", "-c", "printf ready; cat >/dev/null"], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const reader = child.stdout.getReader();
	const acquired = await reader.read();
	reader.releaseLock();
	if (acquired.done) {
		const stderr = await new Response(child.stderr).text();
		const code = await child.exited;
		throw new Error(
			code === 75
				? "Another Trellis installation is in progress."
				: `Cannot lock the Trellis installation: ${stderr.trim()}`,
		);
	}
	try {
		return await publish();
	} finally {
		child.stdin.end();
		await child.exited;
	}
}
