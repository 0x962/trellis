import { expect, test } from "bun:test";
import { runRequest } from "./runAdapter";

test("limits executor requests to the review graph and selected run", () => {
	expect(runRequest({ action: "start", pr: "owner/repo#2", cwd: "/work" })).toEqual({
		path: "",
		method: "POST",
		body: { target: "https://github.com/owner/repo/pull/2", cwd: "/work" },
	});
	expect(() => runRequest({ action: "resume", pr: "owner/repo#2", runId: "../bad" })).toThrow();
	expect(runRequest({ action: "node", pr: "owner/repo#2", runId: "run1", nodeId: "check1" }).path).toBe(
		"/run1/node/check1",
	);
});
