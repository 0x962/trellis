import { expect, test } from "bun:test";
import { isSecureStorageAvailable } from "./secureStoragePolicy.ts";

test("refuses the Linux plaintext backend", () => {
	expect(isSecureStorageAvailable("linux", true, "basic_text")).toBe(false);
	expect(isSecureStorageAvailable("linux", true, "gnome_libsecret")).toBe(true);
});

test("requires encryption on every platform", () => {
	expect(isSecureStorageAvailable("darwin", false, "unknown")).toBe(false);
});
