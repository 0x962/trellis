import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { uploadPendingFiles } from "./uploadPendingFiles";

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name, { type: "text/plain" });

describe("features/attachments/PendingFiles/uploadPendingFiles", () => {
	// TRL-23. The create modal holds files in the browser and uploads them
	// after the create answers, because the ticket has no id before that.
	test("no files uploads nothing", async () => {
		let calls = 0;
		const failed = await uploadPendingFiles(
			async () => {
				calls += 1;
			},
			"TRL-1",
			[],
		);
		expect(failed).toEqual([]);
		expect(calls).toBe(0);
	});

	test("uploads each file to the new ticket in order", async () => {
		const seen: string[] = [];
		const failed = await uploadPendingFiles(
			async ({ ticket, file }) => {
				seen.push(`${ticket}:${file.name}`);
			},
			"TRL-7",
			[file("a.txt"), file("b.txt")],
		);
		expect(failed).toEqual([]);
		expect(seen).toEqual(["TRL-7:a.txt", "TRL-7:b.txt"]);
	});

	test("a refused file is reported and the rest still upload", async () => {
		const seen: string[] = [];
		const failed = await uploadPendingFiles(
			async ({ file }) => {
				seen.push(file.name);
				if (file.name === "big.bin")
					throw new ORPCError("PAYLOAD_TOO_LARGE", { defined: true, data: { maxBytes: 1048576 } });
			},
			"TRL-7",
			[file("a.txt"), file("big.bin"), file("c.txt")],
		);
		expect(seen).toEqual(["a.txt", "big.bin", "c.txt"]);
		expect(failed).toEqual([{ name: "big.bin", error: { code: "PAYLOAD_TOO_LARGE", maxBytes: 1048576 } }]);
	});

	test("an unexpected error throws", async () => {
		await expect(
			uploadPendingFiles(
				async () => {
					throw new Error("boom");
				},
				"TRL-7",
				[file("a.txt")],
			),
		).rejects.toThrow("boom");
	});
});
