import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import bunfig from "../bunfig.toml";
import pkg from "../package.json";

const root = join(import.meta.dir, "..");
const src = join(root, "src");

const walk = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
	);

const lineCount = (text: string) => (text === "" ? 0 : text.trimEnd().split("\n").length);

// Every verb of the plan's CLI table has one file under src/commands.
// `comments` lives in comment.ts and `attachments` in attach.ts.
const commandFiles = [
	"projects",
	"statuses",
	"create",
	"show",
	"list",
	"edit",
	"move",
	"comment",
	"attach",
	"pr",
	"sub",
	"delete",
	"search",
	"activity",
	"brief",
	"watch",
	"open",
	"whoami",
	"status",
	"logs",
	"serve",
	"install",
	"uninstall",
	"backup",
	"restore",
	"export",
];

// CLI-01
test("package.json, bunfig.toml, and file sizes follow the repo rules", () => {
	expect(pkg.name).toBe("@trellis/cli");
	expect(pkg.bin).toEqual({ trellis: "./src/index.ts" });
	expect(pkg.dependencies.citty).toBe("0.2.2");
	const declared = { ...pkg.dependencies, ...("devDependencies" in pkg ? (pkg.devDependencies as object) : {}) };
	for (const [name, version] of Object.entries(declared)) {
		if (name.startsWith("@trellis/")) {
			expect(version, name).toBe("workspace:*");
			continue;
		}
		expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
	}
	expect(bunfig.test.preload).toEqual(["../../test/preload.ts"]);
	for (const name of commandFiles) {
		expect(walk(src).map((file) => relative(src, file))).toContain(join("commands", `${name}.ts`));
	}
	for (const file of walk(src)) {
		expect(lineCount(readFileSync(file, "utf8")), relative(root, file)).toBeLessThanOrEqual(300);
	}
});

// One static import or re-export: the optional `type` keyword and the specifier.
const staticImportPattern = /^(?:import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/gm;
const sideEffectImportPattern = /^import\s+["']([^"']+)["']/gm;
const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g;

// The workspace modules the CLI runs. Every other `@trellis` import it
// writes must carry the `type` keyword, so it costs nothing at start.
// `@trellis/api` itself builds every zod schema and the whole oRPC contract
// when it loads, and `trellis --help` must not pay for that.
const runtimeEntries = ["@trellis/api/client", "@trellis/api/time"];

// CLI-02
test("the CLI imports the contract as a type and never imports server code", () => {
	const files = walk(src).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		const text = readFileSync(file, "utf8");
		const where = relative(root, file);
		const runtimeSpecifiers: string[] = [];
		for (const match of text.matchAll(staticImportPattern)) {
			const [, typeKeyword, specifier] = match;
			if (typeKeyword === undefined) runtimeSpecifiers.push(specifier!);
		}
		for (const match of text.matchAll(sideEffectImportPattern)) runtimeSpecifiers.push(match[1]!);
		for (const match of text.matchAll(dynamicImportPattern)) runtimeSpecifiers.push(match[1]!);
		for (const specifier of runtimeSpecifiers) {
			if (specifier.startsWith("@trellis/")) {
				expect(runtimeEntries, `${where} imports ${specifier} at runtime`).toContain(specifier);
			}
			expect(specifier, `${where} imports server code`).not.toMatch(/apps\/server|@trellis\/server/);
		}
	}
});

// `@trellis/api/time` holds the display formats that the web pages and the
// chat notices of the server also read. It imports nothing, so the CLI pays
// one file for it at start, and `trellis --help` still never loads the
// contract.
test("the time entry the CLI runs imports nothing", () => {
	const api = join(root, "..", "api");
	const manifest = JSON.parse(readFileSync(join(api, "package.json"), "utf8")) as { exports: Record<string, string> };
	const target = manifest.exports["./time"]!;
	const text = readFileSync(join(api, target), "utf8");
	expect([...text.matchAll(staticImportPattern)].length, `${target} imports another file`).toBe(0);
});
