import { describe, expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";

const brief = () => ({
	markdown: "# CDE-42 Dark mode\n\nBody text\n\n## Comments\n\n- navid: Body A\n",
	generatedAt: "2026-09-09T12:00:00.000Z",
});

describe("brief", () => {
	// CLI-110: the markdown is what an agent pipes into its context, so it
	// prints verbatim on a TTY and on a pipe alike.
	test("brief prints the markdown for piping", async () => {
		const tty = await runCli(["brief", "CDE-42"], { "brief.get": brief() }, { tty: true });
		expect(tty.code).toBe(0);
		expect(tty.calls[0]).toMatchObject({ path: "brief.get", input: { ticket: "CDE-42" } });
		expect(tty.stdout).toBe(brief().markdown);

		const piped = await runCli(["brief", "CDE-42"], { "brief.get": brief() }, { tty: false });
		expect(piped.stdout).toBe(brief().markdown);

		const json = await runCli(["brief", "CDE-42", "--json"], { "brief.get": brief() });
		expect(JSON.parse(json.stdout)).toEqual(brief());
	});
});
