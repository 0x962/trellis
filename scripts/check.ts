// `bun run check` runs this file. Every argument after `bun run check` goes to
// turbo unchanged, so `bun run check --summarize` writes a run summary.
//
// test/repo.test.ts spawns a nested `bun run check` with TRELLIS_CHECK_NESTED=1
// to prove the command exits 0. The nested run covers lint and typecheck only,
// so every task with `cache: false` and the 10k perf suite run once per check.
export const checkTasks = {
	full: ["lint", "typecheck", "test", "size-budget", "perf:10k", "typecheck:repo", "test:repo"],
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
