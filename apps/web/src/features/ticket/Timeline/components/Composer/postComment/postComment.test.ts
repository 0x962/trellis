import { expect, test } from "bun:test";
import type { AttachmentUploadOutput, Comment } from "@trellis/api";
import { type PendingCommentAttachment, postComment } from "./postComment";

test("a retry reuses files that the first comment request uploaded", async () => {
	const pending: PendingCommentAttachment[] = [{ file: new File(["screen"], "screen.png", { type: "image/png" }) }];
	let uploadCalls = 0;
	const createInputs: unknown[] = [];
	const created = { id: "01M2PKFAKECOMMENT0000000000" } as Comment;
	const client: Parameters<typeof postComment>[0] = {
		attachments: {
			upload: async () => {
				uploadCalls += 1;
				return { attachment: { id: "01M2PKFAKEATTACHMENT000000" } } as AttachmentUploadOutput;
			},
		},
		comments: {
			create: async (input) => {
				createInputs.push(input);
				if (createInputs.length === 1) throw new Error("The comment request failed.");
				return created;
			},
		},
	};

	await expect(postComment(client, "TRL-20", "See the screen.", "comment-1", pending)).rejects.toThrow(
		"The comment request failed.",
	);
	await expect(postComment(client, "TRL-20", "See the screen.", "comment-1", pending)).resolves.toBe(created);

	expect(uploadCalls).toBe(1);
	expect(createInputs).toEqual([
		{
			ticket: "TRL-20",
			body: "See the screen.",
			dedupeKey: "comment-1",
			attachmentIds: ["01M2PKFAKEATTACHMENT000000"],
		},
		{
			ticket: "TRL-20",
			body: "See the screen.",
			dedupeKey: "comment-1",
			attachmentIds: ["01M2PKFAKEATTACHMENT000000"],
		},
	]);
});
