import { originDir } from "../../../../test/originDir.ts";
import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import config from "../../drizzle.config.ts";

const root = originDir(import.meta.dir);

// The drizzle-kit binary, found the way `bun run db:generate` finds it. The
// isolated linker puts it in this package's node_modules/.bin, and the
// hoisted linker puts it in the repository root's node_modules/.bin.
const drizzleKit = () =>
	Bun.which("drizzle-kit", {
		PATH: [join(root, "node_modules/.bin"), join(root, "../../node_modules/.bin")].join(":"),
	})!;

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
	// new file in the copy. drizzle-kit prefixes `./` to the `--out` path, so
	// the copy lives under the package and the path is relative.
	test("drizzle-kit generate produces no new migration", () => {
		mkdirSync(join(root, ".cache"), { recursive: true });
		const temp = mkdtempSync(join(root, ".cache/generate-"));
		const copy = join(temp, "drizzle");
		cpSync(join(root, "drizzle"), copy, { recursive: true });
		const result = Bun.spawnSync(
			[
				drizzleKit(),
				"generate",
				"--dialect",
				config.dialect,
				"--schema",
				config.schema as string,
				"--out",
				relative(root, copy),
			],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		if (result.exitCode !== 0) console.log(result.stdout.toString(), result.stderr.toString());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("No schema changes");
		expect(sqlFiles(copy)).toEqual(sqlFiles(join(root, "drizzle")));
		expect(readJournal(copy).entries).toEqual(readJournal(join(root, "drizzle")).entries);
		rmSync(temp, { recursive: true });
	});
});
