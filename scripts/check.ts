// `bun run check` runs this file. Every argument after `bun run check` goes to
// turbo unchanged, so `bun run check --summarize` writes a run summary.
//
// perf:10k holds every test that measures milliseconds or resident memory. A
// task that runs beside it changes what it measures, so perf:10k runs after
// the parallel tasks end, one workspace at a time. The second step runs even
// when the first fails, so one check reports both, and the check exits
// nonzero when either step fails.
//
// test/repo.test.ts spawns a nested `bun run check` with TRELLIS_CHECK_NESTED=1
// to prove the command exits 0. The nested run covers lint and typecheck only,
// so every task with `cache: false` and the 10k perf suite run once per check.
const full = ["lint", "typecheck", "test", "size-budget", "perf:10k", "typecheck:repo", "test:repo"];
const serial = ["perf:10k"];

export const checkTasks = {
	full,
	serial,
	parallel: full.filter((task) => !serial.includes(task)),
	nested: ["lint", "typecheck", "typecheck:repo"],
};

const turbo = (tasks: string[], flags: string[] = []) =>
	Bun.spawnSync(["turbo", "run", ...tasks, ...flags, ...process.argv.slice(2)], {
		stdout: "inherit",
		stderr: "inherit",
	}).exitCode;

if (import.meta.main) {
	if (process.env.TRELLIS_CHECK_NESTED === "1") process.exit(turbo(checkTasks.nested));
	const parallelCode = turbo(checkTasks.parallel);
	const serialCode = turbo(checkTasks.serial, ["--concurrency=1"]);
	process.exit(parallelCode || serialCode);
}
