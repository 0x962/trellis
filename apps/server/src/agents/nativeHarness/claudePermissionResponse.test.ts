import { expect, test } from "bun:test";
import fixture from "../../../test/fixtures/nativeHarness/claude-permission-denied.json";
import { claudePermissionResponse } from "./claudePermissionResponse.ts";
import { ClaudeStream } from "./claudeStream.ts";

test("captured denied permission needs input even when Claude reports success", () => {
	const parser = new ClaudeStream("d5d19c01-8bbf-4f76-ba16-4f8e53ee7c79", "9e279750-3637-4528-b3f0-ba2024df820a");
	parser.feed(Buffer.from(`${fixture.map((row) => JSON.stringify(row)).join("\n")}\n`));
	expect(parser.snapshot().state).toBe("needs_input");
	expect(parser.snapshot().acknowledgedMessageIds).toEqual(["cbf63a9a-e080-4145-aefa-43ae35cfe72b"]);
	expect(parser.snapshot().pendingPermissions).toEqual([]);
});
test("permission response targets one request and does not alter settings", () => {
	const response = JSON.parse(
		Buffer.from(claudePermissionResponse("request", { behavior: "deny", message: "No" }), "base64").toString(),
	);
	expect(response.response.request_id).toBe("request");
	expect(response.response.response).toEqual({ behavior: "deny", message: "No" });
});
