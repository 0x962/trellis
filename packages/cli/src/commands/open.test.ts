import { describe, expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";

const webUrl = "http://trellis.localhost/t/CDE-42";

describe("open", () => {
	// CLI-112
	test("open prints the web url", async () => {
		const opened: string[] = [];
		const result = await runCli(["open", "cde-42"], {}, { open: (url) => void opened.push(url) });
		expect(result.code).toBe(0);
		expect(result.stdout).toBe(`${webUrl}\n`);
		expect(result.calls).toEqual([]);
		expect(opened).toEqual([]);
	});

	// CLI-113
	test("open --browser hands the url to the opener", async () => {
		const opened: string[] = [];
		const result = await runCli(["open", "CDE-42", "--browser"], {}, { open: (url) => void opened.push(url) });
		expect(result.code).toBe(0);
		expect(opened).toEqual([webUrl]);
		expect(result.stdout).toBe(`${webUrl}\n`);
	});
});
