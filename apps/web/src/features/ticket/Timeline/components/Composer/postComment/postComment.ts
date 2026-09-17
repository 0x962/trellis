import type { AttachmentUploadOutput, Comment } from "@trellis/api";

export type PendingCommentAttachment = {
	file: File;
	attachmentId?: string;
};

type CommentClient = {
	attachments: {
		upload(input: { ticket: string; file: File }): Promise<AttachmentUploadOutput>;
	};
	comments: {
		create(input: { ticket: string; body: string; dedupeKey: string; attachmentIds?: string[] }): Promise<Comment>;
	};
};

export const postComment = async (
	client: CommentClient,
	ticket: string,
	body: string,
	dedupeKey: string,
	attachments: PendingCommentAttachment[],
) => {
	const attachmentIds: string[] = [];
	for (const pending of attachments) {
		if (pending.attachmentId === undefined) {
			const uploaded = await client.attachments.upload({ ticket, file: pending.file });
			pending.attachmentId = uploaded.attachment.id;
		}
		attachmentIds.push(pending.attachmentId);
	}
	return client.comments.create({
		ticket,
		body,
		dedupeKey,
		...(attachmentIds.length === 0 ? {} : { attachmentIds }),
	});
};
