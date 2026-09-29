import { afterAll, beforeAll, expect, test } from "bun:test";
import { HarnessAccountCreateSchema, HarnessAccountUpdateSchema } from "@trellis/api";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { IoCtx } from "../support.ts";
import { create, update } from "./harnessAccounts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const ctx = {
	actor: { kind: "human", name: "account-test" },
	now: () => new Date("2026-09-29T20:00:00Z"),
	afterCommit: () => {},
} as unknown as IoCtx;

beforeAll(async () => {
	db = await openTestDb();
}, 60_000);
afterAll(async () => {
	await db.$client.close();
});

test("long account names retain identity and uniqueness", async () => {
	const name = "Account".repeat(1000);
	const input = HarnessAccountCreateSchema.parse({ name, harness: "claude" });
	const id = ulid();
	const created = await db.transaction((tx) =>
		create(ctx, tx, { ...input, id, profilePath: `/synthetic/${id}`, managedProfile: false }),
	);
	expect(created.name).toBe(name);
	const nextName = `${name} renamed`;
	const changed = await db.transaction((tx) =>
		update(ctx, tx, HarnessAccountUpdateSchema.parse({ id, name: nextName })),
	);
	expect(changed.id).toBe(id);
	expect(changed.name).toBe(nextName);
	expect(changed.profilePath).toBe(created.profilePath);
	await expect(
		db.transaction((tx) =>
			create(ctx, tx, {
				...input,
				name: nextName,
				id: ulid(),
				profilePath: "/synthetic/duplicate",
				managedProfile: false,
			}),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});
