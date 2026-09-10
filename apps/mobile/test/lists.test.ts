import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// Every source file the app ships, under app/ and src/. A test file asserts
// on a screen and never renders a list of its own.
const sources = () =>
	["app", "src"].flatMap((dir) =>
		readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
			.filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
			.map((entry) => join(dir, entry)),
	);

const read = async (file: string) => await Bun.file(join(root, file)).text();

// The files that draw a list of rows. Each one keeps its rows in a
// FlashList, because a phone must recycle the rows of a long list.
const listFiles = [
	"src/features/projects/ProjectTree/ProjectTree.tsx",
	"src/features/projects/ProjectTicketList/ProjectTicketList.tsx",
];

// The screens and features that draw rows. A ScrollView here would keep
// every row alive at once, so these files scroll through FlashList only.
const rowDirs = ["src/features/projects/", "src/features/search/", "src/components/TicketRow/", "app/project/"];
const rowScreens = ["app/(tabs)/projects.tsx", "app/(tabs)/search.tsx"];

const drawsRows = (file: string) => rowScreens.includes(file) || rowDirs.some((dir) => file.startsWith(dir));

// These render every row they hold, whatever the length of the data.
const banned = ["FlatList", "SectionList", "VirtualizedList"];

describe("lists", () => {
	test("every list renders through FlashList", async () => {
		const importing: string[] = [];
		const offenders: string[] = [];
		for (const file of sources()) {
			const source = await read(file);
			if (source.includes('from "@shopify/flash-list"')) importing.push(file);
			for (const name of [...banned, ...(drawsRows(file) ? ["ScrollView"] : [])]) {
				if (new RegExp(`\\b${name}\\b`).test(source)) offenders.push(`${file}: ${name}`);
			}
		}
		expect(offenders).toEqual([]);
		for (const file of listFiles) expect(importing).toContain(file);
		// The search results are a list too, wherever the search feature keeps them.
		expect(importing.some((file) => file.startsWith("src/features/search/"))).toBe(true);
	});

	test("no mobile source calls tickets.board", async () => {
		const offenders: string[] = [];
		for (const file of sources()) {
			if (/\bboard\b/.test(await read(file))) offenders.push(file);
		}
		expect(offenders).toEqual([]);
	});
});
