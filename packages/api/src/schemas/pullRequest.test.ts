import { expect, test } from "bun:test";
import { CheckSchema } from "./pullRequest.ts";

test("a check row stores the start and the end of the check", () => {
	const check = CheckSchema.parse({
		name: "Build",
		workflow: "CI",
		bucket: "pass",
		link: "https://github.com/acme/app/runs/1",
		startedAt: "2026-09-21T10:00:00.000Z",
		endedAt: "2026-09-21T10:02:14.000Z",
	});

	expect(check.startedAt).toBe("2026-09-21T10:00:00.000Z");
	expect(check.endedAt).toBe("2026-09-21T10:02:14.000Z");
});

test("a check row the poller wrote before the two times reads null for both", () => {
	const check = CheckSchema.parse({ name: "Build", workflow: "CI", bucket: "pass", link: null });

	expect(check).toEqual({ name: "Build", workflow: "CI", bucket: "pass", link: null, startedAt: null, endedAt: null });
});
