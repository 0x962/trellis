if (import.meta.main) {
	const result = Bun.spawnSync(["turbo", "run", "lint", "typecheck", "typecheck:repo", ...process.argv.slice(2)], {
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(result.exitCode);
}
