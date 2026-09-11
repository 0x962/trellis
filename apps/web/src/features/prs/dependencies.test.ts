import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// The named renderers a web app reaches for when it draws a diff itself.
const renderers = ["diff", "diff2html", "react-diff-viewer", "parse-diff", "@git-diff-view/react"];

const packageJson = async (): Promise<{
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
}> => await Bun.file(join(import.meta.dir, "../../../package.json")).json();

describe("pull request feature dependencies", () => {
	// PR-31. The viewer that `diffUrlTemplate` names renders every diff, so
	// no diff library reaches the bundle.
	test("declares no diff rendering library", async () => {
		const pkg = await packageJson();
		const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
		for (const name of names) {
			expect(name.toLowerCase(), name).not.toContain("diff");
		}
		for (const renderer of renderers) {
			expect(names, renderer).not.toContain(renderer);
		}
	});
});
