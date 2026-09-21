import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { sendBackError } from "./sendBackError";

test("an unknown failure never shows its raw message or a file path", () => {
	const error = new Error("ENOENT: /Users/navid/.trellis/harness-attempts/run/launch.json");

	expect(sendBackError(error)).toBe("The server did not confirm the review. Refresh the page before you try again.");
});

test("a GitHub failure names the configured reason", () => {
	const error = new ORPCError("GH_UNAVAILABLE", { data: { reason: "unauthenticated" } });

	expect(sendBackError(error)).toBe("gh is not signed in.");
});
