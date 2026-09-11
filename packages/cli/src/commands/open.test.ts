import { describe, expect, test } from "bun:test";
import { defaultEnv, runCli } from "../../test/deps.ts";

const webUrl = "http://127.0.0.1:4521/t/CDE-42";

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

	// A gateway or a proxy serves trellis under another name, and the ticket
	// URL an agent pastes must name that one.
	test("TRELLIS_PUBLIC_URL names the origin of the printed url", async () => {
		const env = { ...defaultEnv, TRELLIS_PUBLIC_URL: "http://trellis.example/" };
		const result = await runCli(["open", "cde-42"], {}, { env });
		expect(result.code).toBe(0);
		expect(result.stdout).toBe("http://trellis.example/t/CDE-42\n");
	});
});
