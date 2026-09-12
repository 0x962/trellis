import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import * as feature from "./index";

const featureDir = import.meta.dir;

const sourceFiles = async () => {
	const files: string[] = [];
	for await (const path of new Glob("**/*.{ts,tsx}").scan(featureDir)) files.push(path);
	return files;
};

const importsOf = (source: string) => [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);

describe("prs feature barrel", () => {
	// PR-62. The ticket page mounts the section with one line.
	test("exports the section from the feature barrel", () => {
		expect(Object.keys(feature)).toEqual(["PullRequests"]);
		expect(typeof feature.PullRequests).toBe("function");
	});

	test("imports nothing from the ticket feature", async () => {
		const files = await sourceFiles();
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = await Bun.file(join(featureDir, file)).text();
			for (const specifier of importsOf(source)) {
				expect(specifier, `${file} imports ${specifier}`).not.toContain("features/ticket");
			}
		}
	});
});
