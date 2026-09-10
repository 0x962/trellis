import { describe, expect, test } from "bun:test";
import { identifierOf, isSearchable } from "./searchQuery";

describe("the search query", () => {
	test("identifierOf canonicalizes a KEY-n query", () => {
		for (const query of ["CDE-42", "cde-42", " cde-42 "]) expect(identifierOf(query)).toBe("CDE-42");
	});

	test("identifierOf rejects a query that is not a complete identifier", () => {
		for (const query of ["oauth", "CDE", "CDE-", "CDE-0"]) expect(identifierOf(query)).toBeNull();
	});

	test("a blank query is not searchable", () => {
		expect(isSearchable("")).toBe(false);
		expect(isSearchable("   ")).toBe(false);
		expect(isSearchable("oauth")).toBe(true);
	});
});
