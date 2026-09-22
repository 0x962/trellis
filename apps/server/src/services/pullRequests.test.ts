import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import { resolve } from "./pullRequests.ts";
import type { ServiceCtx } from "./support.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const firstId = ulid();
const secondId = ulid();
const at = new Date("2026-09-21T12:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES
			(${firstId}, 'acme', 'app', 57245, 'https://github.com/acme/app/pull/57245', 'open', ${at}, ${at}),
			(${secondId}, 'example', 'service', 57245, 'https://github.com/example/service/pull/57245', 'open', ${at}, ${at})`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("resolves a known pull request URL without a review row", async () => {
	const result = await db.transaction((tx) =>
		resolve({} as ServiceCtx, tx, { ref: "https://github.com/acme/app/pull/57245" }),
	);

	expect(result).toEqual({ id: firstId, url: "https://github.com/acme/app/pull/57245" });
});

test("resolves a known owner repo ref without a review row", async () => {
	const result = await db.transaction((tx) => resolve({} as ServiceCtx, tx, { ref: "example/service#57245" }));

	expect(result).toEqual({ id: secondId, url: "https://github.com/example/service/pull/57245" });
});

test("asks for the repository when a bare pull request number is ambiguous", async () => {
	await expect(db.transaction((tx) => resolve({} as ServiceCtx, tx, { ref: "57245" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["ref"] }] },
	});
});

test("returns a named not-found payload for an unknown pull request", async () => {
	await expect(db.transaction((tx) => resolve({} as ServiceCtx, tx, { ref: "acme/app#404" }))).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "pull request", ref: "acme/app#404" },
	});
});
