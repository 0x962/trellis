import { primeTestDb } from "../apps/server/src/db/testDb.ts";

// `bunfig.toml` names this module under `[test] preload`, and bun runs it
// before a test file. `process.argv[1]` is the path of that file. A test file
// outside `apps/server` opens no database.
// `primeTestDb` builds the tar of the migrated database, which takes about 2
// seconds on the first run of a new schema. A `beforeAll` hook stops after 5
// seconds, and a loaded machine makes the build longer than that, so the build
// runs here and each hook only reads the result.
if (process.argv[1]?.includes("/apps/server/") === true) await primeTestDb();
