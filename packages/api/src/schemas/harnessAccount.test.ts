import { describe, expect, test } from "bun:test";
import { HarnessAccountUpdateSchema } from "./harnessAccount";

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
