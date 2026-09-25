import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type MenuLink, SettingsSetInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../context";
import { openDatabase } from "../../db/open";
import * as settings from "./settings";

let home: string;
let database: Awaited<ReturnType<typeof openDatabase>>;
const ctx = { actor: { kind: "human", name: "test" }, now: new Date() } as ServiceCtx;
const first: MenuLink = {
	id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
	label: "Actions",
	icon: "GithubLogo",
	url: "https://github.com/0x962/trellis/actions",
};
const second: MenuLink = { ...first, id: "128f08be-daf8-4999-abcc-27e20a5d81bd", label: "Docs", icon: "BookOpen" };
const read = () => database.db.transaction((tx) => settings.get(ctx, tx));
const write = (input: unknown) =>
	database.db.transaction((tx) => settings.set(ctx, tx, SettingsSetInputSchema.parse(input)));

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-menu-links-"));
	database = await openDatabase(home);
}, 60_000);
afterAll(async () => {
	await database.close();
	await rm(home, { recursive: true, force: true });
});

test("menu links persist through database reopen and support edit and delete", async () => {
	expect((await read()).menuLinks).toEqual([]);
	await write({ defaultActorName: "test", menuLinks: [second, first] });
	await database.close();
	database = await openDatabase(home);
	expect((await read()).menuLinks).toEqual([second, first]);
	const edited: MenuLink = { ...first, label: "Builds", icon: "Play" };
	await write({ defaultActorName: "test", menuLinks: [second, edited] });
	expect((await read()).menuLinks).toEqual([second, edited]);
	const older = await write({ defaultActorName: "renamed" });
	expect(older.menuLinks).toEqual([second, edited]);
	await write({ defaultActorName: "test", menuLinks: [edited] });
	expect((await read()).menuLinks).toEqual([edited]);
	await write({ defaultActorName: "test", menuLinks: [] });
	expect((await read()).menuLinks).toEqual([]);
}, 60_000);

test("invalid input cannot change stored links", async () => {
	await write({ defaultActorName: "test", menuLinks: [first] });
	await expect(
		write({ defaultActorName: "test", menuLinks: [{ ...first, url: "https://user:secret@example.com" }] }),
	).rejects.toThrow();
	expect((await read()).menuLinks).toEqual([first]);
	await expect(
		database.db.transaction((tx) =>
			settings.set({ ...ctx, actor: null }, tx, { defaultActorName: "test", menuLinks: [] }),
		),
	).rejects.toThrow();
	expect((await read()).menuLinks).toEqual([first]);
});
