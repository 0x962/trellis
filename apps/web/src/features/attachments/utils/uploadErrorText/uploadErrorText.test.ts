import { describe, expect, test } from "bun:test";
import { uploadErrorText } from "./uploadErrorText";

describe("uploadErrorText", () => {
	test("explains a network failure without changing the filename", () => {
		expect(uploadErrorText("release.txt", { code: "UPLOAD_FAILED" })).toBe(
			"release.txt is not attached. The upload failed.",
		);
	});
});
