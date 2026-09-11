import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../test/css";

const repoRoot = join(packageRoot, "../..");

// Every component file under these two directories. Test files are excluded:
// they assert on classes and never paint anything.
const componentFiles = () =>
	["primitives", "domain"].flatMap((dir) =>
		readdirSync(join(packageRoot, "src", dir), { recursive: true, encoding: "utf8" })
			.filter((entry) => entry.endsWith(".tsx") && !entry.endsWith(".test.tsx"))
			.map((entry) => join("src", dir, entry)),
	);

describe("tokens only", () => {
	test("primitives and domain components use tokens only", async () => {
		const files = componentFiles();
		expect(files.length).toBeGreaterThanOrEqual(29);
		const violations: string[] = [];
		const empty: string[] = [];
		for (const file of files) {
			const source = await Bun.file(join(packageRoot, file)).text();
			if (!source.includes("className")) empty.push(file);
			for (const pattern of [/#[0-9a-fA-F]{3,8}\b/, /\[[^\]]*\d+px[^\]]*\]/, /rgba?\(/]) {
				const hit = source.match(pattern);
				if (hit) violations.push(`${file}: ${hit[0]}`);
			}
		}
		expect(violations).toEqual([]);
		expect(empty).toEqual([]);
	});

	test("web and UI components use radius tokens instead of rounded-full", async () => {
		const violations: string[] = [];
		for (const directory of ["packages/ui/src", "apps/web/src"]) {
			const files = readdirSync(join(repoRoot, directory), { recursive: true, encoding: "utf8" }).filter(
				(file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
			);
			expect(files.length).toBeGreaterThan(0);
			for (const file of files) {
				const source = await Bun.file(join(repoRoot, directory, file)).text();
				if (/\brounded-full\b/.test(source)) violations.push(join(directory, file));
			}
		}
		expect(violations).toEqual([]);
	});
});
