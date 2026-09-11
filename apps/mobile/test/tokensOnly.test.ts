import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// Every source file under app/ and src/. The generated palette is the one
// file that holds a color. Test files are excluded: they assert on values
// and never paint anything.
const sources = () =>
	["app", "src"]
		.flatMap((dir) =>
			readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
				.filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
				.map((entry) => join(dir, entry)),
		)
		.filter((file) => file !== "src/theme/tokens.ts");

const sizeKeys = [
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"padding",
	"paddingTop",
	"paddingBottom",
	"paddingLeft",
	"paddingRight",
	"paddingHorizontal",
	"paddingVertical",
	"margin",
	"marginTop",
	"marginBottom",
	"marginLeft",
	"marginRight",
	"marginHorizontal",
	"marginVertical",
	"gap",
	"rowGap",
	"columnGap",
	"fontSize",
	"lineHeight",
	"borderRadius",
	"borderWidth",
	"top",
	"left",
	"right",
	"bottom",
];

const patterns = [
	{ name: "hex color", pattern: /#[0-9a-fA-F]{3,8}\b/ },
	{ name: "rgb()", pattern: /rgba?\(/ },
	{ name: "px literal in a style", pattern: new RegExp(`\\b(${sizeKeys.join("|")})\\s*:\\s*\\d`) },
];

describe("tokens only", () => {
	test("no raw color or spacing literal outside src/theme/tokens.ts", async () => {
		const files = sources();
		expect(files.length).toBeGreaterThan(0);
		const violations: string[] = [];
		for (const file of files) {
			const source = await Bun.file(join(root, file)).text();
			for (const { name, pattern } of patterns) {
				const hit = source.match(pattern);
				if (hit) violations.push(`${file}: ${name} ${hit[0]}`);
			}
		}
		expect(violations).toEqual([]);
	});

	test("native corners use the square radius tokens", async () => {
		const violations: string[] = [];
		for (const file of sources().filter((file) => file !== "src/components/StatusIcon/StatusIcon.tsx")) {
			const source = await Bun.file(join(root, file)).text();
			for (const match of source.matchAll(/\bborder(?:[A-Z]\w*)?Radius\s*:\s*([^,}\n]+)/g)) {
				if (!/^tokens\.radius\.\w+$/.test(match[1]!.trim())) violations.push(`${file}: ${match[0]}`);
			}
		}
		expect(violations).toEqual([]);
	});
});
