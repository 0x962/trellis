import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// A test that builds real infrastructure belongs under `<workspace>/test/int/`.
// `bun run test` skips that directory and `bun run test:int` runs only it, so an
// agent that runs the tests waits seconds instead of minutes.
//
// Real infrastructure means one of these, which each cost about half a second
// or more every time a file asks for one:
//   - a PGlite database (test/helpers/db.ts, or a direct openDb call)
//   - the Hono app (test/helpers/app.ts, apps/web/test/server)
//   - a spawned process or server (Bun.spawn, Bun.serve, node:child_process)
//
// This test reads every test file, follows its relative imports, and checks that
// a file which reaches one of those sits under test/int/, and that a file which
// reaches none of them does not.

const root = resolve(import.meta.dir, "..");

// A file that opens a database, boots the app, or starts a server process.
const BUILDERS = [
	"apps/server/test/helpers/db.ts",
	"apps/server/test/helpers/app.ts",
	"apps/server/test/helpers/server.ts",
	"apps/web/test/server/index.ts",
];

const transpiler = new Bun.Transpiler({ loader: "tsx" });
const STARTS_PROCESS = /\bBun\s*\.\s*(?:serve|spawn)\b|\b(?:execFileSync|spawnSync)\b/;
const OPENS_DATABASE = /\b(?:diskDb|openDb)\s*\(|\bnew\s+PGlite\b/;
const REGEX_PREFIX = /[([{,:;=!?&|+*%^~<>-]/;
const REGEX_KEYWORD =
	/\b(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/;

const sourceWithoutText = (source: string) => {
	const code = source.split("");
	const hide = (start: number, end: number) => {
		for (let index = start; index < end; index += 1) {
			if (code[index] !== "\n") code[index] = " ";
		}
	};
	const regexStartsAt = (index: number) => {
		const prefix = code.slice(0, index).join("").trimEnd();
		if (prefix.length === 0) return true;
		return REGEX_PREFIX.test(prefix.at(-1)!) || REGEX_KEYWORD.test(prefix);
	};
	const scanQuoted = (start: number, quote: "'" | '"') => {
		let index = start + 1;
		while (index < source.length) {
			if (source[index] === "\\") index += 2;
			else if (source[index++] === quote) break;
		}
		hide(start, index);
		return index;
	};
	const scanRegex = (start: number) => {
		let index = start + 1;
		let inClass = false;
		while (index < source.length) {
			if (source[index] === "\\") index += 2;
			else if (source[index] === "[") {
				inClass = true;
				index += 1;
			} else if (source[index] === "]") {
				inClass = false;
				index += 1;
			} else if (source[index] === "/" && !inClass) {
				index += 1;
				while (/\w/.test(source[index] ?? "")) index += 1;
				break;
			} else index += 1;
		}
		hide(start, index);
		return index;
	};
	const scanCode = (start: number, templateExpression = false): number => {
		let index = start;
		let braces = templateExpression ? 1 : 0;
		while (index < source.length) {
			const char = source[index]!;
			const next = source[index + 1];
			if (char === "'" || char === '"') index = scanQuoted(index, char);
			else if (char === "`") index = scanTemplate(index);
			else if (char === "/" && next === "/") {
				const end = source.indexOf("\n", index + 2);
				hide(index, end === -1 ? source.length : end);
				index = end === -1 ? source.length : end;
			} else if (char === "/" && next === "*") {
				const commentStart = index;
				const end = source.indexOf("*/", index + 2);
				index = end === -1 ? source.length : end + 2;
				hide(commentStart, index);
			} else if (char === "/" && regexStartsAt(index)) index = scanRegex(index);
			else if (templateExpression && char === "{") {
				braces += 1;
				index += 1;
			} else if (templateExpression && char === "}") {
				braces -= 1;
				index += 1;
				if (braces === 0) return index;
			} else index += 1;
		}
		return index;
	};
	const scanTemplate = (start: number) => {
		let index = start + 1;
		hide(start, index);
		while (index < source.length) {
			if (source[index] === "\\") {
				hide(index, index + 2);
				index += 2;
			} else if (source[index] === "`") {
				hide(index, index + 1);
				return index + 1;
			} else if (source[index] === "$" && source[index + 1] === "{") {
				hide(index, index + 2);
				index = scanCode(index + 2, true);
			} else {
				hide(index, index + 1);
				index += 1;
			}
		}
		return index;
	};
	scanCode(0);
	return code.join("");
};

// The file a relative specifier names. Bun resolves a bare directory to its
// index file and adds the extension, so this tries the same order.
const fileFor = (from: string, specifier: string) => {
	const base = resolve(dirname(from), specifier);
	const tries = [`${base}.ts`, `${base}.tsx`, base, join(base, "index.ts"), join(base, "index.tsx")];
	return tries.find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
};

const answers = new Map<string, boolean>();

// True when this file, or anything it imports, builds real infrastructure.
const buildsInfrastructure = (file: string, visiting: Set<string> = new Set()): boolean => {
	const cached = answers.get(file);
	if (cached !== undefined) return cached;
	if (visiting.has(file)) return false;
	visiting.add(file);

	const path = relative(root, file);
	if (BUILDERS.includes(path)) return true;

	const source = readFileSync(file, "utf8");
	const imports = transpiler.scanImports(source);
	const executable = sourceWithoutText(source);
	if (STARTS_PROCESS.test(executable) || OPENS_DATABASE.test(executable)) return true;
	if (imports.some(({ path }) => path === "node:child_process")) return true;

	let answer = false;
	for (const { path: specifier } of imports) {
		if (!specifier.startsWith(".")) continue;
		const imported = fileFor(file, specifier);
		if (imported && buildsInfrastructure(imported, visiting)) {
			answer = true;
			break;
		}
	}
	// Only a file whose answer needed no unfinished import is safe to keep. A
	// file inside a cycle gets the answer of the walk that started the cycle.
	if (visiting.size === 1) answers.set(file, answer);
	return answer;
};

// The repository rule is not one of the test files that it classifies.
const testFiles = [...new Bun.Glob("**/*.test.{ts,tsx}").scanSync({ cwd: root, absolute: true })].filter(
	(file) => !file.includes("/node_modules/") && !file.includes("/e2e/") && file !== import.meta.path,
);

const inIntegrationDir = (file: string) => relative(root, file).includes("test/int/");

describe("test layout", () => {
	test("the source scan keeps executable calls and ignores source text", () => {
		const textOnly = `
			// Bun.spawn(["false"]);
			const command = "spawnSync('false')";
			const pattern = /Bun\\.serve/;
			const generated = \`import { spawn } from "node:child_process"; Bun.spawn([]);\`;
		`;
		expect(STARTS_PROCESS.test(sourceWithoutText(textOnly))).toBe(false);
		expect(transpiler.scanImports(textOnly)).toEqual([]);
		expect(STARTS_PROCESS.test(sourceWithoutText("Bun.serve({ fetch() {} });"))).toBe(true);
		expect(STARTS_PROCESS.test(sourceWithoutText("const server = `${Bun.serve({ fetch() {} })}`;"))).toBe(true);
	});

	test("the import scan ignores type-only imports", () => {
		const imports = transpiler.scanImports('import type { Process } from "./process.ts";');
		expect(imports).toEqual([]);
	});

	test("the repository holds test files to check", () => {
		expect(testFiles.length).toBeGreaterThan(400);
	});

	test("every test that builds real infrastructure sits under test/int/", () => {
		const misplaced = testFiles
			.filter((file) => buildsInfrastructure(file) && !inIntegrationDir(file))
			.map((file) => relative(root, file));
		expect(misplaced).toEqual([]);
	});

	test("no test under test/int/ is free of real infrastructure", () => {
		const cheap = testFiles
			.filter((file) => inIntegrationDir(file) && !buildsInfrastructure(file))
			.map((file) => relative(root, file));
		expect(cheap).toEqual([]);
	});
});
