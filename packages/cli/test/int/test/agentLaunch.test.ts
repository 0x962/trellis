import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentLaunch, rolePrompt } from "@trellis/api";
import { originDir } from "../../../../../test/originDir.ts";
import { fakeServer } from "../../fakeServer.ts";
import { statusSet } from "../../fixtures.ts";

// The launch command the server hands to the runner, run by `sh` the way a
// Superset terminal runs it. `trellis` on PATH is this CLI from source, and
// `claude` is a fake that records its argument list. The prompt claude gets
// must be the output of `trellis instructions` for the same role.
const bin = mkdtempSync(join(tmpdir(), "trellis-cli-launch-"));
afterAll(() => rmSync(bin, { recursive: true, force: true }));

const script = (name: string, body: string) => {
	writeFileSync(join(bin, name), body);
	chmodSync(join(bin, name), 0o755);
};
script(
	"trellis",
	`#!/bin/sh\nexec "${process.execPath}" "${join(originDir(import.meta.dir), "..", "src", "index.ts")}" "$@"\n`,
);
script(
	"claude",
	`#!${process.execPath}
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(join(bin, "claude.json"))}, JSON.stringify({
	argv: process.argv.slice(2),
	actor: process.env.TRELLIS_ACTOR,
}));
`,
);

const described = {
	...statusSet(),
	statuses: statusSet().statuses.map((row) => ({ ...row, description: `Rule for ${row.name}.` })),
};
const server = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	fetch: fakeServer({ "statuses.list": described }).fetch,
});
afterAll(() => server.stop(true));
const url = `http://127.0.0.1:${server.port}`;

const launchAndRead = async (command: string) => {
	const proc = Bun.spawn(["sh", "-c", command], {
		env: { PATH: `${bin}:${process.env.PATH}`, TRELLIS_HOME: process.env.TRELLIS_HOME },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	expect(stderr).toBe("");
	expect(code).toBe(0);
	return JSON.parse(readFileSync(join(bin, "claude.json"), "utf8")) as { argv: string[]; actor: string };
};

// `$(...)` drops the trailing newlines of the text it captures.
const captured = (prompt: string) => prompt.replace(/\n+$/, "");

describe("the launch command with the real CLI", () => {
	test("a builder gets exactly the builder prompt", async () => {
		const launch = agentLaunch({ role: "builder", project: "CDE", ticket: "CDE-42", url });
		const claude = await launchAndRead(launch.command);
		expect(claude.argv).toEqual([
			...["-n", "CDE-42", "--dangerously-skip-permissions"],
			captured(rolePrompt({ role: "builder", project: "CDE", ticket: "CDE-42" })),
		]);
		expect(claude.actor).toBe("agent:builder-cde-42");
	});

	test("a reviewer gets exactly the reviewer prompt", async () => {
		const prUrl = "https://github.com/o/r/pull/7";
		const launch = agentLaunch({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl, url });
		const claude = await launchAndRead(launch.command);
		expect(claude.argv[3]).toBe(captured(rolePrompt({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl })));
	});

	test("the manager gets the manager prompt with the status descriptions the server holds", async () => {
		const launch = agentLaunch({ role: "manager", project: "CDE", url });
		const claude = await launchAndRead(launch.command);
		expect(claude.argv.slice(0, 3)).toEqual(["-n", "CDE manager", "--dangerously-skip-permissions"]);
		expect(claude.argv[3]).toBe(
			captured(rolePrompt({ role: "manager", project: "CDE", statuses: described.statuses })),
		);
		expect(claude.argv[3]).toContain("Rule for Todo.");
		expect(claude.actor).toBe("agent:manager-cde");
	});
});
