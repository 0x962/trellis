import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

export const openTestDb = async () => {
	const db = await openDb(":memory:");
	await migrate(db);
	return db;
};
