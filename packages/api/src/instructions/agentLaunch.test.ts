import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentLaunch } from "./agentLaunch.ts";

// A fake `claude` and a fake `trellis` on PATH. Each one writes its argument
// list and the two trellis variables to a JSON file. The fake `trellis`
// prints a prompt with every character that a shell reads as syntax, so a
// test proves the prompt reaches `claude` as one unchanged argument.
const bin = mkdtempSync(join(tmpdir(), "trellis-launch-"));
afterAll(() => rmSync(bin, { recursive: true, force: true }));

const trickyPrompt = `It's "quoted" $HOME \`tick\` \\ $(nope)\nline two`;

const fake = (name: string, prints: string) => {
	const path = join(bin, name);
	writeFileSync(
		path,
		`#!${process.execPath}
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(join(bin, `${name}.json`))}, JSON.stringify({
	argv: process.argv.slice(2),
	actor: process.env.TRELLIS_ACTOR ?? null,
	url: process.env.TRELLIS_URL ?? null,
}));
process.stdout.write(${JSON.stringify(prints)});
`,
	);
	chmodSync(path, 0o755);
};
fake("claude", "");
fake("trellis", `${trickyPrompt}\n`);

type Recorded = { argv: string[]; actor: string | null; url: string | null };

const runLaunch = (command: string) => {
	const result = Bun.spawnSync(["sh", "-c", command], {
		env: { PATH: `${bin}:${process.env.PATH}`, HOME: "/home/test" },
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	const read = (name: string) => JSON.parse(readFileSync(join(bin, `${name}.json`), "utf8")) as Recorded;
	return { claude: read("claude"), trellis: read("trellis") };
};

const url = "http://127.0.0.1:4599";

describe("agentLaunch", () => {
	test("a builder runs claude named after its ticket, as its own actor, with the builder prompt", () => {
		const launch = agentLaunch({ role: "builder", project: "CDE", ticket: "CDE-42", url });
		expect(launch.title).toBe("CDE-42");
		expect(launch.actor).toBe("agent:builder-cde-42");
		const { claude, trellis } = runLaunch(launch.command);
		expect(trellis.argv).toEqual(["instructions", "--role", "builder", "--project", "CDE", "--ticket", "CDE-42"]);
		expect(trellis.url).toBe(url);
		expect(claude.argv).toEqual(["-n", "CDE-42", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:builder-cde-42");
		expect(claude.url).toBe(url);
	});

	test("a reviewer tab is named '<ticket> review' and its prompt names the PR", () => {
		const prUrl = "https://github.com/o/r/pull/7?q='x'";
		const launch = agentLaunch({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl, url });
		expect(launch.title).toBe("CDE-42 review");
		expect(launch.actor).toBe("agent:reviewer-cde-42");
		const { claude, trellis } = runLaunch(launch.command);
		expect(trellis.argv).toEqual([
			...["instructions", "--role", "reviewer", "--project", "CDE", "--ticket", "CDE-42"],
			...["--pr", prUrl],
		]);
		expect(claude.argv).toEqual(["-n", "CDE-42 review", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:reviewer-cde-42");
	});

	test("the manager tab is named '<project> manager' and acts as the project's manager", () => {
		const launch = agentLaunch({ role: "manager", project: "CDE", url });
		expect(launch.title).toBe("CDE manager");
		expect(launch.actor).toBe("agent:manager-cde");
		const { claude, trellis } = runLaunch(launch.command);
		expect(trellis.argv).toEqual(["instructions", "--role", "manager", "--project", "CDE"]);
		expect(claude.argv).toEqual(["-n", "CDE manager", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:manager-cde");
		expect(claude.url).toBe(url);
	});

	test("the command is one line, so a terminal that types it runs it whole", () => {
		for (const launch of [
			agentLaunch({ role: "manager", project: "CDE", url }),
			agentLaunch({ role: "builder", project: "CDE", ticket: "CDE-42", url }),
			agentLaunch({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl: "https://x/pull/1", url }),
		]) {
			expect(launch.command).not.toContain("\n");
		}
	});
});
