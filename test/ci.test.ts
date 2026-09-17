import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");

test("the repository defines no GitHub Actions workflows", () => {
	const directory = join(root, ".github", "workflows");
	const workflows = existsSync(directory)
		? readdirSync(directory).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
		: [];
	expect(workflows).toEqual([]);
});

// Every workspace is at 0.0.0 and `.changeset/config.json` puts them in one
// fixed group, so a minor changeset releases every workspace as 0.1.0.
describe("the 0.1.0 release", () => {
	const workspaces = ["apps", "packages"].flatMap((dir) =>
		readdirSync(join(root, dir))
			.filter((entry) => !entry.startsWith("."))
			.map((entry) => JSON.parse(text(join(dir, entry, "package.json"))) as { name: string; version: string }),
	);

	const changesets = readdirSync(join(root, ".changeset"))
		.filter((file) => file.endsWith(".md") && file !== "README.md")
		.map((file) => text(join(".changeset", file)));

	const bumps = (changeset: string) =>
		Object.fromEntries(
			[...(/^---\n([\s\S]*?)\n---/.exec(changeset)?.[1] ?? "").matchAll(/^"([^"]+)": (\w+)$/gm)].map((match) => [
				match[1],
				match[2],
			]),
		);

	test("a changeset releases every workspace from 0.0.0 as a minor bump", () => {
		const release = changesets.map(bumps).find((entries) => Object.keys(entries).length > 0)!;
		for (const workspace of workspaces) {
			expect(workspace.version, workspace.name).toBe("0.0.0");
			expect(release[workspace.name], workspace.name).toBe("minor");
		}
	});

	test("CHANGELOG.md has a 0.1.0 entry", () => {
		expect(text("CHANGELOG.md")).toMatch(/^## 0\.1\.0$/m);
	});
});
