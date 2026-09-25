import { expect, test } from "bun:test";
import { sessionSlug, temporarySessionName, uniqueDirectoryName } from "./sessionName.ts";

test("an unnamed session starts with a temporary name", () => {
	expect(temporarySessionName).toBe("New session");
});

test("a folder name drops the case and the punctuation of the session name", () => {
	expect(sessionSlug("  Display Name!  ")).toBe("display-name");
});

test("a name written outside the Latin alphabet gives an empty folder name", () => {
	expect(sessionSlug("日本語")).toBe("");
});

test("a folder name that is taken gets the first free number", () => {
	expect(uniqueDirectoryName("principal", new Set(["principal", "principal-2"]))).toBe("principal-3");
});

test("a free folder name keeps the text it came from", () => {
	expect(uniqueDirectoryName("principal", new Set(["other"]))).toBe("principal");
});

test("a numbered folder name stays inside 40 characters", () => {
	const long = "a".repeat(40);
	expect(uniqueDirectoryName(long, new Set([long]))).toBe(`${"a".repeat(38)}-2`);
});
