import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type MenuLink, SettingsSetInputSchema } from "@trellis/api";
import { defaultAgentPrompt } from "@trellis/api/agent-guide";
import type { ServiceCtx } from "../../context";
import { openDatabase } from "../../db/open";
import * as settings from "./index";

let home: string;
let database: Awaited<ReturnType<typeof openDatabase>>;
const ctx = { actor: { kind: "human", name: "test" }, now: new Date() } as ServiceCtx;
const actionsLink: MenuLink = {
	id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
	label: "Actions",
	icon: "GithubLogo",
	url: "https://github.com/0x962/trellis/actions",
};
const docsLink: MenuLink = {
	...actionsLink,
	id: "128f08be-daf8-4999-abcc-27e20a5d81bd",
	label: "Release documentation ".repeat(100).trim(),
	icon: "BookOpen",
};
const readSettings = () => database.db.transaction((tx) => settings.get(ctx, tx));
const writeSettings = (input: unknown) =>
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
	expect((await readSettings()).menuLinks).toEqual([]);
	expect((await database.db.transaction((tx) => settings.defaultActorName(ctx, tx))).stored).toBe(false);
	await writeSettings({ defaultActorName: "test" });
	await writeSettings({ menuLinks: [docsLink, actionsLink] });
	expect(await database.db.transaction((tx) => settings.defaultActorName(ctx, tx))).toEqual({
		name: "test",
		stored: true,
	});
	await database.close();
	database = await openDatabase(home);
	expect((await readSettings()).menuLinks).toEqual([docsLink, actionsLink]);
	const edited: MenuLink = { ...actionsLink, label: "Builds", icon: "Play" };
	await writeSettings({ menuLinks: [docsLink, edited] });
	expect((await readSettings()).defaultActorName).toBe("test");
	expect((await readSettings()).menuLinks).toEqual([docsLink, edited]);
	const older = await writeSettings({ defaultActorName: "renamed" });
	expect(older.menuLinks).toEqual([docsLink, edited]);
	await writeSettings({ defaultActorName: "test", menuLinks: [edited] });
	expect((await readSettings()).menuLinks).toEqual([edited]);
	await writeSettings({ defaultActorName: "test", menuLinks: [] });
	expect((await readSettings()).menuLinks).toEqual([]);
}, 60_000);

test("invalid input cannot change stored links", async () => {
	await writeSettings({ defaultActorName: "test", menuLinks: [actionsLink] });
	await expect(
		writeSettings({
			defaultActorName: "test",
			menuLinks: [{ ...actionsLink, url: "https://user:secret@example.com" }],
		}),
	).rejects.toThrow();
	expect((await readSettings()).menuLinks).toEqual([actionsLink]);
	await expect(
		database.db.transaction((tx) =>
			settings.set({ ...ctx, actor: null }, tx, { defaultActorName: "test", menuLinks: [] }),
		),
	).rejects.toThrow();
	expect((await readSettings()).menuLinks).toEqual([actionsLink]);
});

test("default actor names retain distinct suffixes after the first 64 characters", async () => {
	for (const suffix of ["first", "second"]) {
		const name = `${"a".repeat(64)}-${suffix}`;
		expect((await writeSettings({ defaultActorName: name })).defaultActorName).toBe(name);
		expect((await readSettings()).defaultActorName).toBe(name);
		expect(await database.db.transaction((tx) => settings.defaultActorName(ctx, tx))).toEqual({
			name,
			stored: true,
		});
	}
});

test("the startup prompt persists through reopen and ordinary settings edits", async () => {
	const template = "  # Custom instructions\n\t{{session.request}}\n";
	await database.db.transaction((tx) =>
		settings.setAgentPrompt(ctx, tx, { template, expectedTemplate: defaultAgentPrompt }),
	);
	await writeSettings({ defaultActorName: "test" });
	await database.close();
	database = await openDatabase(home);
	expect((await database.db.transaction((tx) => settings.agentPromptSettings(ctx, tx))).template).toBe(template);
	expect((await readSettings()).defaultActorName).toBe("test");
	await database.db.transaction((tx) =>
		settings.setAgentPrompt(ctx, tx, { template: null, expectedTemplate: template }),
	);
}, 60_000);

test("cleanup defaults and saved periods survive older clients and reopen", async () => {
	expect((await readSettings()).sessionCleanup).toEqual({ archiveAfterDays: 3, deleteAfterDays: 7 });
	const sessionCleanup = { archiveAfterDays: null, deleteAfterDays: 14 };
	await writeSettings({ sessionCleanup });
	await writeSettings({ defaultActorName: "older client" });
	await database.close();
	database = await openDatabase(home);
	expect((await readSettings()).sessionCleanup).toEqual(sessionCleanup);
	await expect(writeSettings({ sessionCleanup: { archiveAfterDays: 0, deleteAfterDays: 14 } })).rejects.toThrow();
	expect((await readSettings()).sessionCleanup).toEqual(sessionCleanup);
}, 60_000);
