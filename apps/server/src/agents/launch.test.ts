import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchCommand, restartText, resumeCommand } from "./launch.ts";
import {
	builderBranch,
	managerBranch,
	managerTitle,
	managerWorkspaceName,
	projectTag,
	reviewerTitle,
	roleActor,
} from "./names.ts";

// Superset runs a launch command in a shell. These tests run each command
// through `sh -c` with a fake `claude` and a fake `trellis` first on PATH.
// Each fake writes its argument list and the two trellis variables to a
// JSON file, so a test proves what claude receives after the shell quoting.
// The fake `trellis` prints a prompt with every character a shell reads as
// syntax.

const bin = mkdtempSync(join(process.env.TRELLIS_HOME!, "launch-"));
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

const run = (command: string) => {
	for (const name of ["claude", "trellis"]) rmSync(join(bin, `${name}.json`), { force: true });
	const result = Bun.spawnSync(["sh", "-c", command], {
		env: { PATH: `${bin}:/usr/bin:/bin`, HOME: "/home/test" },
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	const read = (name: string) => {
		const path = join(bin, `${name}.json`);
		return (Bun.file(path).size > 0 ? JSON.parse(readFileSync(path, "utf8")) : null) as Recorded | null;
	};
	return { claude: read("claude")!, trellis: read("trellis") };
};

const url = "http://127.0.0.1:4521";

describe("agent names", () => {
	test("each role acts as its own actor, from the project path or the ticket identifier", () => {
		expect(roleActor({ role: "manager", project: "CDE" })).toBe("agent:manager-cde");
		expect(roleActor({ role: "manager", project: "CDE.web" })).toBe("agent:manager-cde.web");
		expect(roleActor({ role: "builder", ticket: "CDE-42" })).toBe("agent:builder-cde-42");
		expect(roleActor({ role: "reviewer", ticket: "CDE-42" })).toBe("agent:reviewer-cde-42");
	});

	test("tabs, workspaces, tags, and branches carry the project and the ticket", () => {
		expect(managerTitle("CDE")).toBe("CDE manager");
		expect(reviewerTitle("CDE-42")).toBe("CDE-42 review");
		expect(managerWorkspaceName("CDE")).toBe("CDE · manager");
		expect(projectTag("CDE")).toBe("trellis-cde");
		expect(projectTag("CDE.web")).toBe("trellis-cde-web");
		expect(managerBranch("CDE")).toBe("trellis-cde-manager");
		expect(managerBranch("CDE.web")).toBe("trellis-cde-web-manager");
	});

	test("a builder branch holds the lowercase identifier, then at most 40 slug characters of the title", () => {
		expect(builderBranch("CDE-42", "Fix the login page!")).toBe("cde-42-fix-the-login-page");
		const long = builderBranch("CDE-7", "Move every settings screen onto the new token table and drop the old one");
		expect(long).toBe("cde-7-move-every-settings-screen-onto-the-new");
		expect(long.endsWith("-")).toBe(false);
		expect(builderBranch("CDE-9", "!!!")).toBe("cde-9");
	});
});

describe("launch commands", () => {
	test("a builder runs claude named after its ticket, as its own actor, with the builder prompt", () => {
		const { claude, trellis } = run(launchCommand({ role: "builder", project: "CDE", ticket: "CDE-42", url }));
		expect(trellis!.argv).toEqual(["instructions", "--role", "builder", "--project", "CDE", "--ticket", "CDE-42"]);
		expect(trellis!.url).toBe(url);
		expect(claude.argv).toEqual(["-n", "CDE-42", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:builder-cde-42");
		expect(claude.url).toBe(url);
	});

	test("a reviewer tab is named '<ticket> review' and its prompt names the PR", () => {
		const prUrl = "https://github.com/o/r/pull/7?q='x'";
		const { claude, trellis } = run(launchCommand({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl, url }));
		expect(trellis!.argv).toEqual([
			...["instructions", "--role", "reviewer", "--project", "CDE", "--ticket", "CDE-42"],
			...["--pr", prUrl],
		]);
		expect(claude.argv).toEqual(["-n", "CDE-42 review", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:reviewer-cde-42");
	});

	test("the manager tab is named '<project> manager' and acts as the project's manager", () => {
		const { claude, trellis } = run(launchCommand({ role: "manager", project: "CDE.web", url }));
		expect(trellis!.argv).toEqual(["instructions", "--role", "manager", "--project", "CDE.web"]);
		expect(claude.argv).toEqual(["-n", "CDE.web manager", "--dangerously-skip-permissions", trickyPrompt]);
		expect(claude.actor).toBe("agent:manager-cde.web");
		expect(claude.url).toBe(url);
	});

	test("an exited manager resumes its Claude session with the text as its prompt and reads no instructions", () => {
		const text = "trellis: 1 change in CDE (CDE-1 commented by o'brien). Run: trellis agents inbox --project CDE";
		const { claude, trellis } = run(resumeCommand({ project: "CDE", sessionId: "abc-123", text, url }));
		expect(trellis).toBeNull();
		expect(claude.argv).toEqual([
			...["-n", "CDE manager", "--dangerously-skip-permissions"],
			...["--resume", "abc-123", text],
		]);
		expect(claude.actor).toBe("agent:manager-cde");
		expect(claude.url).toBe(url);
	});

	test("every command is one line, so a terminal that types it runs it whole", () => {
		for (const command of [
			launchCommand({ role: "manager", project: "CDE", url }),
			launchCommand({ role: "builder", project: "CDE", ticket: "CDE-42", url }),
			launchCommand({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl: "https://x/pull/1", url }),
			resumeCommand({ project: "CDE", sessionId: "s", text: "a\nb", url }),
		]) {
			expect(command).not.toContain("\n");
		}
	});

	test("the restart text points the manager at its inbox", () => {
		expect(restartText("CDE")).toBe("trellis: the server restarted. Run: trellis agents inbox --project CDE");
	});
});
