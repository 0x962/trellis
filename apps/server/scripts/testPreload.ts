// The root `bunfig.toml` names this module under `[test] preload`, and bun
// runs it one time for each test process, before the first test file.
// `migratedTar` in `../src/db/testDb.ts` states why the build runs here.
// bun gives a preload the path of the first test file only. A run that starts
// outside `apps/server` therefore skips this, and a server test file later in
// that same run builds the tar in its own setup hook. `bun test
// apps/server/src` and `bun test apps/server/src/db/<file>` both start on a
// server file.
// The dynamic import keeps the server database modules, and PGlite with them,
// out of a test process for `apps/web`, `packages/ui`, `packages/api` and
// `packages/cli`.
if (process.argv[1]?.includes("/apps/server/") === true) {
	const { migratedTar } = await import("../src/db/testDb.ts");
	await migratedTar();
}
