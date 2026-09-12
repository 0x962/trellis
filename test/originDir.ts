// An integration test lives under `<workspace>/test/int/` and keeps the rest of
// the path it had before it moved there. So `apps/server/src/db/cache.test.ts`
// sits at `apps/server/test/int/src/db/cache.test.ts`.
//
// A test that reads a file by path, such as a fixture, a migration directory, or
// the source file it checks, needs the directory that holds that file. Its own
// `import.meta.dir` now points inside `test/int/`, which holds no source. This
// function removes the `test/int` segment and gives back the original directory.
//
//   originDir("/repo/apps/server/test/int/src/db") === "/repo/apps/server/src/db"
//   originDir("/repo/apps/server/test/int")        === "/repo/apps/server"
//
// A test that reads its sibling test files does not call this. Those siblings
// moved with it, so `import.meta.dir` is already correct for them.
export const originDir = (dir: string) => dir.replace(/[/\\]test[/\\]int(?=[/\\]|$)/, "");
