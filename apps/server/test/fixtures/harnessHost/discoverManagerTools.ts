export async function discoverManagerTools(config: string) {
	const { command, args } = JSON.parse(config).mcpServers.trellis as { command: string; args: string[] };
	const request = JSON.stringify({ jsonrpc: "2.0", id: "fixture-discovery", method: "tools/list" });
	const child = Bun.spawn([command, ...args], {
		stdin: new Blob([`${request}\n`]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, output, error] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (code !== 0) throw new Error(`Manager tool discovery failed: ${error}`);
	const response = JSON.parse(output);
	if (response.id !== "fixture-discovery" || response.result.tools.length === 0)
		throw new Error("Manager tool discovery returned no tools.");
}
