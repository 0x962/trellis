import { describe, expect, test } from "bun:test";
import { uploadErrorText } from "./uploadErrorText";

describe("uploadErrorText", () => {
	test("reads a size cap in megabytes", () => {
		expect(uploadErrorText("notes.txt", { code: "PAYLOAD_TOO_LARGE", maxBytes: 1024 * 1024 })).toBe(
			"notes.txt is not attached. The file is larger than the 1 MB limit.",
		);
	});

	test("explains a network failure without changing the filename", () => {
		expect(uploadErrorText("release.txt", { code: "UPLOAD_FAILED" })).toBe(
			"release.txt is not attached. The upload failed.",
		);
	});

	test("names the archived project instead of a generic failure", () => {
		expect(uploadErrorText("plan.txt", { code: "PROJECT_ARCHIVED" })).toBe(
			"plan.txt is not attached. The project is archived.",
		);
	});
});
