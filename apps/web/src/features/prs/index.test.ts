import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import * as feature from "./index";

// The named renderers a web app reaches for when it draws a diff itself.
const renderers = ["diff", "diff2html", "react-diff-viewer", "parse-diff", "@git-diff-view/react"];

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

	// PR-63. The section stands beside the ticket page and draws no diff.
	// Show diff opens the viewer that `diffUrlTemplate` names, so no
	// renderer reaches this feature.
	test("imports nothing from the ticket feature and no diff renderer", async () => {
		const files = await sourceFiles();
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = await Bun.file(join(featureDir, file)).text();
			for (const specifier of importsOf(source)) {
				expect(specifier, `${file} imports ${specifier}`).not.toContain("features/ticket");
				expect(renderers, `${file} imports ${specifier}`).not.toContain(specifier);
			}
		}
	});
});
