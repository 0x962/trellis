import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

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
	"apps/server/test/int/src/agents/harnesses/pi.test.ts",
	"apps/server/test/int/src/agents/harnesses/piManager.test.ts",
	"apps/web/test/server/index.ts",
];
const transpilers = {
	".mjs": new Bun.Transpiler({ loader: "js" }),
	".ts": new Bun.Transpiler({ loader: "ts" }),
	".tsx": new Bun.Transpiler({ loader: "tsx" }),
};
const STARTS_PROCESS = /\bBun\s*\.\s*(?:serve|spawn)\b|\b(?:createServer|execFileSync|spawnSync)\b/;
const OPENS_DATABASE = /\b(?:diskDb|openDb)\s*\(|\bnew\s+PGlite\b/;
const REGEX_PREFIX = /[([{,:;=!?&|+*%^~<>-]/;
const REGEX_KEYWORD =
	/\b(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/;
const SOURCE_EXTENSIONS = new Set([".mjs", ".ts", ".tsx"]);
const sourceWithoutShebang = (source: string) => {
	if (!source.startsWith("#!")) return source;
	return source.replace(/^#![^\n]*/, (shebang) => " ".repeat(shebang.length));
};
const scanImports = (file: string, source: string) =>
	transpilers[extname(file) as keyof typeof transpilers].scanImports(sourceWithoutShebang(source));
const sourceWithoutText = (input: string) => {
	const source = sourceWithoutShebang(input);
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

// The classifier follows executable source modules only. Bun resolves
// extensionless source paths and directories, so these candidates include both forms.
const sourceFileFor = (from: string, specifier: string) => {
	const base = resolve(dirname(from), specifier);
	const extension = extname(base);
	if (extension) {
		if (!SOURCE_EXTENSIONS.has(extension)) return;
		return statSync(base, { throwIfNoEntry: false })?.isFile() ? base : undefined;
	}
	const tries = [
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.mjs`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
		join(base, "index.mjs"),
	];
	return tries.find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
};

const createInfrastructureClassifier = () => {
	type Inspection = { imports: ReturnType<typeof scanImports>; direct: boolean };
	const answers = new Map<string, boolean>();
	const inspections = new Map<string, Inspection>();
	const scanCounts = new Map<string, number>();
	const inspect = (file: string) => {
		const cached = inspections.get(file);
		if (cached) return cached;
		const path = relative(root, file);
		const source = readFileSync(file, "utf8");
		const imports = scanImports(file, source);
		const executable = sourceWithoutText(source);
		const inspection = {
			imports,
			direct:
				BUILDERS.includes(path) ||
				STARTS_PROCESS.test(executable) ||
				OPENS_DATABASE.test(executable) ||
				imports.some(({ path }) => path === "node:child_process"),
		};
		inspections.set(file, inspection);
		scanCounts.set(file, (scanCounts.get(file) ?? 0) + 1);
		return inspection;
	};
	const visit = (file: string, visiting: Set<string>): boolean => {
		const cached = answers.get(file);
		if (cached !== undefined) return cached;
		if (visiting.has(file)) return false;
		visiting.add(file);
		const { imports, direct } = inspect(file);
		let answer = direct;
		for (const { path: specifier } of imports) {
			if (answer || !specifier.startsWith(".")) continue;
			const imported = sourceFileFor(file, specifier);
			if (imported && visit(imported, visiting)) answer = true;
		}
		visiting.delete(file);
		return answer;
	};
	const buildsInfrastructure = (file: string) => {
		const absolute = resolve(file);
		const cached = answers.get(absolute);
		if (cached !== undefined) return cached;
		const answer = visit(absolute, new Set());
		answers.set(absolute, answer);
		return answer;
	};
	return {
		buildsInfrastructure,
		scanCountFor: (file: string) => scanCounts.get(resolve(file)) ?? 0,
	};
};

// True when this file, or anything it imports, builds real infrastructure.
const { buildsInfrastructure } = createInfrastructureClassifier();

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
		expect(scanImports("fixture.ts", textOnly)).toEqual([]);
		expect(STARTS_PROCESS.test(sourceWithoutText("Bun.serve({ fetch() {} });"))).toBe(true);
		expect(STARTS_PROCESS.test(sourceWithoutText("const server = `${Bun.serve({ fetch() {} })}`;"))).toBe(true);
	});

	test("the import scan ignores type-only imports", () => {
		const imports = scanImports("fixture.ts", 'import type { Process } from "./process.ts";');
		expect(imports).toEqual([]);
	});

	test("the import scan parses TypeScript generic arrow functions", () => {
		const source = 'import { value } from "./value.ts"; const run = <T>(input: T) => input;';
		expect(scanImports("fixture.ts", source).map(({ path }) => path)).toEqual(["./value.ts"]);
	});

	test("the import scan accepts source shebangs", () => {
		const bun = '#!/usr/bin/env bun\nimport { value } from "./value.ts";';
		const node = "#!/usr/bin/env node\ncreateServer();";
		expect(scanImports("fixture.ts", bun).map(({ path }) => path)).toEqual(["./value.ts"]);
		expect(scanImports("fixture.mjs", node)).toEqual([]);
		expect(STARTS_PROCESS.test(sourceWithoutText(node))).toBe(true);
	});

	test("the classifier scans one shared helper once", () => {
		const fixture = join(process.env.TRELLIS_TEST_ROOT!, "layout-cache");
		mkdirSync(fixture);
		const shared = join(fixture, "shared.ts");
		writeFileSync(shared, "export const value = 1;\n");
		for (const name of ["first", "second"]) {
			writeFileSync(
				join(fixture, `${name}.ts`),
				'import { value } from "./shared.ts"; void value;\n',
			);
		}
		const classifier = createInfrastructureClassifier();
		expect(classifier.buildsInfrastructure(join(fixture, "first.ts"))).toBe(false);
		expect(classifier.buildsInfrastructure(join(fixture, "second.ts"))).toBe(false);
		expect(classifier.scanCountFor(shared)).toBe(1);
	});

	test("the source resolver ignores asset imports", () => {
		expect(sourceFileFor(import.meta.path, "../packages/ui/src/base.css")).toBeUndefined();
	});

	test("the source resolver follows JavaScript modules that start servers", () => {
		const server = sourceFileFor(import.meta.path, "../apps/server/src/agents/harnesses/opencode/control.mjs");
		expect(server).toEndWith("control.mjs");
		expect(STARTS_PROCESS.test(sourceWithoutText(readFileSync(server!, "utf8")))).toBe(true);
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
