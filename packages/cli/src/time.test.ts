import { expect, test } from "bun:test";
import { localDateTime } from "./time";

test("localDateTime crosses date and daylight-saving boundaries", () => {
	const options = { locale: "en-CA", timeZone: "America/Toronto" };
	expect(localDateTime("2026-01-01T01:30:00.000Z", options)).toBe("Dec 31, 2025 at 08:30:00 PM EST");
	expect(localDateTime("2026-03-08T06:59:00.000Z", options)).toEndWith("01:59:00 AM EST");
	expect(localDateTime("2026-03-08T07:01:00.000Z", options)).toEndWith("03:01:00 AM EDT");
	expect(localDateTime("2026-11-01T05:30:00.000Z", options)).toEndWith("01:30:00 AM EDT");
	expect(localDateTime("2026-11-01T06:30:00.000Z", options)).toEndWith("01:30:00 AM EST");
});
