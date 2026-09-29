import { expect, test } from "bun:test";
import { prepareFiles } from "./attachments.ts";

test("prepares complete valid files above the former configured limit", async () => {
	const body = "文🙂".repeat(400);
	const files = await prepareFiles([new File([body], "notes.txt", { type: "text/plain" })]);

	expect(files).toHaveLength(1);
	expect(files[0]!.bytes.toString()).toBe(body);
	expect(files[0]!.bytes.byteLength).toBeGreaterThan(1024);
});
