import { expect, test } from "bun:test";
import { reviewImage } from "./reviewImage";

test("accepts only GitHub image locations and excludes credentials and account pages", () => {
	expect(reviewImage("https://github.com/o/r/blob/main/image.png")).toBe(
		"https://raw.githubusercontent.com/o/r/main/image.png",
	);
	for (const value of [
		"http://github.com/user-attachments/assets/123",
		"https://github.com/settings/tokens",
		"https://github.com.evil.test/o/r/blob/x/a",
		"https://user:pass@raw.githubusercontent.com/o/r/x/a",
		"https://raw.githubusercontent.com:8443/o/r/x/a",
	])
		expect(reviewImage(value)).toBeNull();
});
