import { describe, expect, test } from "bun:test";
import { renameAttachment } from "./renameAttachment";

describe("renameAttachment", () => {
	test("copies the file before it deletes the original", async () => {
		const order: string[] = [];
		const failure = await renameAttachment({
			copy: async () => {
				order.push("copy");
			},
			removeOriginal: async () => {
				order.push("removeOriginal");
			},
		});
		expect(order).toEqual(["copy", "removeOriginal"]);
		expect(failure).toBeNull();
	});

	test("keeps the original file when the copy fails", async () => {
		let deleted = false;
		const boom = new Error("the upload failed");
		const failure = await renameAttachment({
			copy: () => Promise.reject(boom),
			removeOriginal: async () => {
				deleted = true;
			},
		});
		expect(deleted).toBe(false);
		expect(failure).toEqual({ step: "copy", error: boom });
	});

	test("names the delete step when the original file stays", async () => {
		const boom = new Error("the delete failed");
		const failure = await renameAttachment({
			copy: () => Promise.resolve(),
			removeOriginal: () => Promise.reject(boom),
		});
		expect(failure).toEqual({ step: "removeOriginal", error: boom });
	});
});
