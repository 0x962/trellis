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
});
