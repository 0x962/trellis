import { describe, expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";

const body =
	'{"table":"projects","row":{"key":"CDE"}}\n{"table":"tickets","row":{"identifier":"CDE-42"}}\n{"table":"comments","row":{}}\n';

const raw = (request: Request) => {
	const url = new URL(request.url);
	if (url.pathname !== "/api/export") throw new Error(`unexpected path ${url.pathname}`);
	return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
};

describe("export", () => {
	// CLI-119
	test("export streams the NDJSON body to stdout", async () => {
		const result = await runCli(["export"], {}, { raw });
		expect(result.code).toBe(0);
		expect(result.requests).toHaveLength(1);
		const request = result.requests[0]!;
		expect(request.method).toBe("GET");
		expect(request.url).toBe("http://127.0.0.1:4521/api/export");
		expect(request.headers.get("x-trellis-actor")).toBe("agent:claude-code");
		expect(result.stdout).toBe(body);

		const json = await runCli(["export", "--json"], {}, { raw });
		expect(json.stdout).toBe(body);
	});

	// CLI-119: an error answer never reaches stdout, so `export > dump.ndjson`
	// leaves no error line in the dump and the shell sees the failure.
	test("export exits with the mapped code when the route refuses", async () => {
		const refuse = () =>
			new Response(JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "Internal server error" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		const result = await runCli(["export"], {}, { raw: refuse });
		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("error: Internal server error (INTERNAL_SERVER_ERROR)\n");
	});
});
