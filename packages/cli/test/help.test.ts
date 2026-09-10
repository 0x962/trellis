import { expect, test } from "bun:test";
import { join } from "node:path";
import { stripAnsi } from "./ansi.ts";

const root = join(import.meta.dir, "..");

// `bun src/index.ts <argv>` in the package directory with no server running.
export const spawnCli = (argv: string[]) => {
	const result = Bun.spawnSync(["bun", "src/index.ts", ...argv], {
		cwd: root,
		env: { ...process.env, NO_COLOR: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		stdout: stripAnsi(result.stdout.toString()),
		stderr: stripAnsi(result.stderr.toString()),
	};
};

const verbs = [
	"projects",
	"statuses",
	"create",
	"show",
	"list",
	"edit",
	"move",
	"comment",
	"comments",
	"attach",
	"attachments",
	"pr",
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
	"agents",
];

const globalFlags = ["--json", "--jsonl", "--quiet", "--as", "--url", "--no-color"];

// CLI-03
test("trellis --help lists every verb and every global flag", () => {
	const { exitCode, stdout } = spawnCli(["--help"]);
	expect(exitCode).toBe(0);
	for (const verb of verbs) {
		expect(stdout, verb).toMatch(new RegExp(`(^|\\s)${verb}(\\s|$)`, "m"));
	}
	for (const flag of globalFlags) {
		expect(stdout, flag).toContain(flag);
	}
});

// CLI-04
test("group verbs render their subverbs in --help", () => {
	const groups: Record<string, string[]> = {
		projects: ["list", "create", "show", "move", "repos"],
		statuses: ["list", "add", "edit", "rm", "clear"],
		pr: ["add", "list", "rm", "refresh", "diff"],
		agents: ["inbox", "register", "start", "review", "status", "retry", "stop", "on", "off"],
	};
	for (const [group, subverbs] of Object.entries(groups)) {
		const { exitCode, stdout } = spawnCli([group, "--help"]);
		expect(exitCode, group).toBe(0);
		for (const subverb of subverbs) {
			expect(stdout, `${group} ${subverb}`).toMatch(new RegExp(`(^|\\s)${subverb}(\\s|$)`, "m"));
		}
	}
});
