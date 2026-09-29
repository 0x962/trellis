import { expect, test } from "bun:test";
import { createEngineClient } from "../../../langflowHost";
import { createReceipt } from "../createReceipt";
import { deliver } from "../deliver";
import { testFixture } from "../testFixture";
import { decisionEngine } from "./decisionEngine";

test("an HTTP conflict never confirms a decision", async () => {
	const f = testFixture();
	const receipt = createReceipt(f.ctx, f.view, f.checkpoint, f.input);
	const paths: string[] = [];
	let checked = false;
	const client = createEngineClient({
		endpoint: "http://127.0.0.1:9000",
		authenticationFile: "/fixture/token",
		dependencies: {
			readAuthenticationFile: async () => "token",
			fetch: async (url, init) => {
				paths.push(String(url));
				if (String(url).endsWith("/lookup"))
					return Response.json({ state: "absent", lookup: JSON.parse(String(init?.body)), authoritative: true });
				expect(checked).toBe(true);
				return Response.json({ detail: "decision_conflict" }, { status: 409 });
			},
		},
	});
	const engine = decisionEngine(client, {
		signal: new AbortController().signal,
		archive: { readAuthorityBytes: () => JSON.stringify(f.authority) },
		beforeAccept: async () => {
			checked = true;
		},
	});
	const result = await deliver({ ...receipt, authority: f.authority }, engine, () => {});
	expect(result.state).toBe("unknown");
	expect(result.acceptance).toBeNull();
	expect(paths).toEqual([
		"http://127.0.0.1:9000/trellis-v1/decisions/lookup",
		"http://127.0.0.1:9000/trellis-v1/decisions/accept",
	]);
});
