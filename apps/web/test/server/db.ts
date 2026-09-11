import { freshDb, type TestDb } from "../../../server/test/helpers/db.ts";

// One in-memory PGlite per test file. A PGlite instance takes about half a
// second to open, and a test file builds a server per test, so every server
// of one file shares this database and restores the seed into it.

let held: Promise<TestDb> | undefined;

export const sharedDb = () => {
	held ??= freshDb();
	return held;
};
