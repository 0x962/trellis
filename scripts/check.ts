// test/repo.test.ts starts a nested check. That run covers lint and types
// so test:repo cannot call itself without end.
export const checkTasks = {
	full: ["lint", "typecheck", "test", "size-budget", "typecheck:repo", "test:repo"],
	nested: ["lint", "typecheck", "typecheck:repo"],
};

if (import.meta.main) {
	const tasks = process.env.TRELLIS_CHECK_NESTED === "1" ? checkTasks.nested : checkTasks.full;
	const result = Bun.spawnSync(["turbo", "run", ...tasks, ...process.argv.slice(2)], {
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(result.exitCode);
}
