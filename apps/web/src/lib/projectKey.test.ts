import { describe, expect, test } from "bun:test";
import { suggestKey } from "./projectKey";

describe("lib/projectKey", () => {
	// WS-74. The key is the first letter of each word, upper-case, 2 to 5
	// characters. One word takes its first two letters. A taken key grows
	// by the next letters of the name until it is free.
	test("suggestKey derives a unique 2 to 5 letter key from the name", () => {
		expect(suggestKey("Superset CDE", [])).toBe("SC");
		expect(suggestKey("trellis", [])).toBe("TR");
		expect(suggestKey("margin", ["MA"])).toBe("MAR");
		expect(suggestKey("a b c d e f", [])).toBe("ABCDE");
	});

	test("suggestKey skips every taken key and stays inside the key grammar", () => {
		const key = suggestKey("Cloud Data Engine", ["CDE", "TRL", "MRG"]);
		expect(key).not.toBe("CDE");
		expect(key).toMatch(/^[A-Z][A-Z0-9]{1,4}$/);
		expect(suggestKey("cde", ["CD", "CDE"])).toMatch(/^[A-Z][A-Z0-9]{1,4}$/);
	});
});
