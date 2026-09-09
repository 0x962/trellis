import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "./drizzle.config.ts";

const root = import.meta.dir;

type Journal = { entries: Array<{ tag: string }> };

const readJournal = (dir: string) => JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as Journal;

const sqlFiles = (dir: string) =>
	readdirSync(dir)
		.filter((entry) => entry.endsWith(".sql"))
		.sort();

describe("drizzle-kit configuration", () => {
	test("drizzle.config.ts points drizzle-kit at schema.ts and the drizzle directory", () => {
		expect(config.dialect).toBe("postgresql");
		expect(config.schema).toBe("src/db/schema.ts");
		expect(config.out).toBe("drizzle");
	});

	// drizzle-kit reads the schema from the package (the imports of schema.ts
	// resolve there) and writes into the copy, so the committed directory is
	// never touched. A schema change that skipped `db:generate` shows up as a
	// new file in the copy.
	test("drizzle-kit generate produces no new migration", () => {
		const temp = mkdtempSync(join(process.env.TRELLIS_HOME as string, "drizzle-"));
		const copy = join(temp, "drizzle");
		cpSync(join(root, "drizzle"), copy, { recursive: true });
		const result = Bun.spawnSync(
			[
				join(root, "node_modules/.bin/drizzle-kit"),
				"generate",
				"--dialect",
				config.dialect,
				"--schema",
				config.schema as string,
				"--out",
				copy,
			],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		if (result.exitCode !== 0) console.log(result.stdout.toString(), result.stderr.toString());
		expect(result.exitCode).toBe(0);
		expect(sqlFiles(copy)).toEqual(sqlFiles(join(root, "drizzle")));
		expect(readJournal(copy).entries).toEqual(readJournal(join(root, "drizzle")).entries);
	});
});
