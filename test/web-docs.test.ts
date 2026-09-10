import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { instructions } from "../packages/api/src/instructions";

const root = join(import.meta.dir, "..");
const read = (path: string) => Bun.file(join(root, path)).text();

const cliCommands = [
	"projects list",
	"projects create",
	"projects show",
	"projects move",
	"projects repos",
	"statuses list",
	"statuses add",
	"statuses edit",
	"statuses rm",
	"statuses clear",
	"create",
	"show",
	"list",
	"edit",
	"move",
	"comment",
	"comments",
	"attach",
	"attachments",
	"pr add",
	"pr list",
	"pr rm",
	"pr refresh",
	"pr diff",
	"sub",
	"delete",
	"search",
	"activity",
	"brief",
	"inbox",
	"watch",
	"open",
	"whoami",
	"instructions",
	"status",
	"logs",
	"serve",
	"install",
	"uninstall",
	"backup",
	"restore",
	"export",
];

const relativeLinks = (markdown: string) =>
	[...markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)]
		.map((match) => match[1]!.trim().replace(/^<|>$/g, ""))
		.filter((target) => !/^(?:[a-z]+:|#)/i.test(target))
		.map((target) => decodeURIComponent(target.split(/[?#]/, 1)[0]!));

describe("public documentation", () => {
	test("README lists every CLI command from the plan", async () => {
		const readme = await read("README.md");
		for (const command of cliCommands) {
			expect(readme, command).toContain(`trellis ${command}`);
		}
	});

	test("README gives the ticket request with both required headers", async () => {
		const readme = await read("README.md");
		const curl = readme.split("\n").find((line) => line.startsWith("curl "));
		expect(curl).toBeDefined();
		expect(curl).toContain("x-trellis-actor: agent:claude-code");
		expect(curl).toContain("Content-Type: application/json");
	});

	test("README and CONTRIBUTING use no em dash or emoji", async () => {
		for (const path of ["README.md", "CONTRIBUTING.md"]) {
			const markdown = await read(path);
			expect(markdown, path).not.toContain("—");
			expect(markdown, path).not.toMatch(/\p{Extended_Pictographic}/u);
		}
	});

	test("the agent guide contains the TRL instructions block", async () => {
		const agents = await read("docs/agents.md");
		expect(agents).toContain(instructions("TRL").trim());
	});

	test("README references the architecture diagram", async () => {
		expect(existsSync(join(root, "docs/architecture.svg"))).toBe(true);
		expect(await read("README.md")).toContain("docs/architecture.svg");
	});

	test("every relative link in the public markdown resolves", async () => {
		for (const path of ["README.md", "CONTRIBUTING.md"]) {
			for (const target of relativeLinks(await read(path))) {
				expect(existsSync(resolve(root, dirname(path), target)), `${path}: ${target}`).toBe(true);
			}
		}
	});
});
