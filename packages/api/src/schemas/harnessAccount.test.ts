import { describe, expect, test } from "bun:test";
import { HarnessAccountCreateSchema, HarnessAccountUpdateSchema } from "./harnessAccount";

describe("HarnessAccountUpdateSchema", () => {
	test("rejects the removed enabled field", () => {
		expect(
			HarnessAccountUpdateSchema.safeParse({
				id: "01M2Q0Z191Q244RDP6R3SBFKE5",
				enabled: false,
			}).success,
		).toBe(false);
	});
});

test("account names retain their full value on create and update", () => {
	const name = "Account ".repeat(1000).trim();
	expect(HarnessAccountCreateSchema.parse({ name, harness: "claude" }).name).toBe(name);
	expect(HarnessAccountUpdateSchema.parse({ id: "01M2Q0Z191Q244RDP6R3SBFKE5", name }).name).toBe(name);
	expect(HarnessAccountCreateSchema.safeParse({ name: " ", harness: "claude" }).success).toBe(false);
	expect(HarnessAccountUpdateSchema.safeParse({ id: "01M2Q0Z191Q244RDP6R3SBFKE5", name: " " }).success).toBe(false);
});
