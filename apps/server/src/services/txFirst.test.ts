import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// The repo rule: a function that touches the database takes the transaction
// it must run in. It never opens one itself, because a second statement on
// the PGlite instance while a transaction holds it waits for that
// transaction and never returns.

const sources = {
	"storage/blobs.ts": join(import.meta.dir, "..", "storage", "blobs.ts"),
	"services/attachments.ts": join(import.meta.dir, "attachments.ts"),
	"services/pullRequests.ts": join(import.meta.dir, "pullRequests.ts"),
	"services/system.ts": join(import.meta.dir, "system.ts"),
};

const read = async (path: string) => await Bun.file(path).text();

// Splits a parameter list on the commas that separate parameters. A comma
// inside a type such as Record<string, unknown> sits at a deeper level and
// does not split.
const splitParams = (list: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const character of list) {
		if ("<([{".includes(character)) depth++;
		if (">)]}".includes(character)) depth--;
		if (character === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += character;
	}
	if (current.trim().length > 0) parts.push(current);
	return parts.map((part) =>
		part
			.trim()
			.split(":")[0]!
			.trim()
			.replace(/^\.\.\./, ""),
	);
};

type Exported = { name: string; params: string[] };

const exportedFunctions = (source: string): Exported[] => {
	const found: Exported[] = [];
	const arrow = /export const (\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([\s\S]*?)\)\s*(?::[^=]*)?=>/g;
	const declared = /export\s+(?:async\s+)?function\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\(([\s\S]*?)\)\s*[:{]/g;
	for (const match of source.matchAll(arrow)) found.push({ name: match[1]!, params: splitParams(match[2]!) });
	for (const match of source.matchAll(declared)) found.push({ name: match[1]!, params: splitParams(match[2]!) });
	return found;
};

const entryPoints: Record<string, string[]> = {
	"services/attachments.ts": ["upload", "remove", "list", "get"],
	"services/pullRequests.ts": ["link", "unlink", "refresh", "diff", "list"],
	"services/system.ts": ["health", "backup", "exportNdjson"],
};

describe("tx first", () => {
	test("every service takes ctx and tx first and imports no module level database", async () => {
		for (const [label, path] of Object.entries(sources)) {
			const source = await read(path);
			expect([label, /from\s+"[^"]*db\/client(\.ts)?"/.test(source)]).toEqual([label, false]);
			for (const fn of exportedFunctions(source)) {
				if (!fn.params.includes("tx")) continue;
				expect([label, fn.name, fn.params.slice(0, 2)]).toEqual([label, fn.name, ["ctx", "tx"]]);
				expect([label, fn.name, fn.params.length]).toEqual([label, fn.name, 3]);
				expect([label, fn.name, fn.params[2]]).toEqual([label, fn.name, "input"]);
			}
			for (const name of entryPoints[label] ?? []) {
				const fn = exportedFunctions(source).find((candidate) => candidate.name === name);
				expect([label, name, fn?.params]).toEqual([label, name, ["ctx", "tx", "input"]]);
			}
		}
	});

	test("every delivered source file stays under 300 lines", async () => {
		for (const [label, path] of Object.entries(sources)) {
			const lines = (await read(path)).split("\n").length;
			expect([label, lines < 300]).toEqual([label, true]);
		}
	});
});
