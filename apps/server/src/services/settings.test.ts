import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type Settings, SettingsSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { count } from "../../test/fixtures";
import { at, type Harness, minutesAgo, NOW, serviceHarness } from "../../test/helpers/services.ts";
import * as settings from "./settings.ts";

// Settings live one row per key with a jsonb value. `get` fills a missing
// key with its default. `set` replaces the three values. A settings write
// is not activity and emits no event.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type SettingRow = { key: string; value: unknown; updated_at: string };

const settingRows = () => h.rows<SettingRow>(sql`SELECT key, value, ${at("updated_at")} FROM settings ORDER BY key`);

const get = () =>
	h.read((tx) =>
		settings.get(
			h.ctx(() => {}, { actor: null }),
			tx,
		),
	);
const set = (input: Settings) => h.run((ctx, tx) => settings.set(ctx, tx, input));

const written: Settings = {
	startWithAgentTemplate: 'codex "{brief}"',
	defaultActorName: "navid",
	stalledHours: 48,
	diffUrlTemplate: "http://margin.localhost/{url}",
};

describe("settings", () => {
	test("get returns the defaults on an empty table", async () => {
		const defaults = await get();
		const parsed = SettingsSchema.parse(defaults);
		expect(Object.keys(parsed).sort()).toEqual([
			"defaultActorName",
			"diffUrlTemplate",
			"stalledHours",
			"startWithAgentTemplate",
		]);
		expect(parsed.startWithAgentTemplate).toContain("{brief}");
		expect(parsed.stalledHours).toBe(24);
		expect(parsed.diffUrlTemplate).toBe("{url}/files");
		expect(await count(h.db, "settings")).toBe(0);
	});

	test("set writes one row per key and get reads them back", async () => {
		const returned = await set(written);
		expect(returned).toEqual(written);
		const rows = await settingRows();
		expect(rows.map((row) => row.key)).toEqual([
			"defaultActorName",
			"diffUrlTemplate",
			"stalledHours",
			"startWithAgentTemplate",
		]);
		expect(rows.map((row) => row.value)).toEqual(["navid", "http://margin.localhost/{url}", 48, 'codex "{brief}"']);
		expect(await get()).toEqual(written);
	});

	test("get fills a missing key with its default", async () => {
		const defaults = await get();
		await h.db.execute(sql`INSERT INTO settings (key, value, updated_at) VALUES ('stalledHours', '72'::jsonb, ${NOW})`);
		expect(await get()).toEqual({ ...defaults, stalledHours: 72 });
	});

	test("a template round-trips through jsonb without a change", async () => {
		const template = 'claude "$(trellis brief {brief})"\n# {not a token} \\n {{double}}\n\ttail';
		await set({ ...written, startWithAgentTemplate: template });
		expect((await get()).startWithAgentTemplate).toBe(template);
	});

	test("set moves updated_at and writes no activity", async () => {
		await set(written);
		await h.db.execute(sql`UPDATE settings SET updated_at = ${minutesAgo(30)}`);
		await set({ ...written, stalledHours: 12, defaultActorName: "other" });
		const rows = await settingRows();
		expect(rows).toHaveLength(4);
		for (const row of rows) expect(row.updated_at, row.key).toBe(NOW.toISOString());
		expect(await count(h.db, "activity")).toBe(0);
		expect(h.flushed).toEqual([]);
	});
});
