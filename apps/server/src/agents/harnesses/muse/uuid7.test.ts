import { expect, test } from "bun:test";
import { uuid7 } from "./uuid7.ts";

test("a UUIDv7 carries its millisecond time in front and its version and variant bits", () => {
	const at = Date.UTC(2026, 8, 16, 12, 0, 0);
	const value = uuid7(at);
	expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	expect(Number.parseInt(value.replaceAll("-", "").slice(0, 12), 16)).toBe(at);
	expect(uuid7(at)).not.toBe(value);
});
