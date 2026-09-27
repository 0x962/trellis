import { expect, test } from "bun:test";
import { secureStorageIsAvailable } from "./secureStoragePolicy.ts";

test("refuses the Linux plaintext backend", () => {
	expect(secureStorageIsAvailable("linux", true, "basic_text")).toBe(false);
	expect(secureStorageIsAvailable("linux", true, "gnome_libsecret")).toBe(true);
});

test("requires encryption on every platform", () => {
	expect(secureStorageIsAvailable("darwin", false, "unknown")).toBe(false);
});
