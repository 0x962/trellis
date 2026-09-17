import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	AttachmentDeleteOutputSchema,
	AttachmentIdInputSchema,
	AttachmentListInputSchema,
	AttachmentSchema,
	AttachmentUploadInputSchema,
	AttachmentUploadOutputSchema,
} from "../schemas/attachment.ts";
import { base } from "./base.ts";

export const attachments = {
	list: base
		.route({ method: "GET", path: "/tickets/{ticket}/attachments", summary: "List the attachments of a ticket" })
		.input(AttachmentListInputSchema)
		.output(z.array(AttachmentSchema)),
	upload: base
		.errors(pickErrors(["PAYLOAD_TOO_LARGE", "PROJECT_ARCHIVED", "COMMENT_ATTACHMENT_MISMATCH"]))
		.route({
			method: "POST",
			path: "/tickets/{ticket}/attachments",
			successStatus: 201,
			summary: "Upload a file as multipart form data",
		})
		.input(AttachmentUploadInputSchema)
		.output(AttachmentUploadOutputSchema),
	get: base
		.route({ method: "GET", path: "/attachments/{id}", summary: "Read attachment metadata" })
		.input(AttachmentIdInputSchema)
		.output(AttachmentSchema),
	delete: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/attachments/{id}", summary: "Delete an attachment" })
		.input(AttachmentIdInputSchema)
		.output(AttachmentDeleteOutputSchema),
};
