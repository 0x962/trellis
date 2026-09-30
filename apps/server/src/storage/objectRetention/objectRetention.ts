import { join } from "node:path";
import { withHashLock } from "../hashStore.ts";

// The database worker shares this lock between backups and object collectors for one home.
// Each caller acquires it before a transaction, so collection can wait while database requests continue.
// A backup holds it from inventory capture until every immutable object has a private copy.
export const withObjectRetention = <T>(home: string, task: () => Promise<T>): Promise<T> =>
	withHashLock(join(home, "backups", "object-retention"), task);
