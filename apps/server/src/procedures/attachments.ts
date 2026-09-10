import type { AttachmentUploadOutput } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const attachments = os.attachments.router({
	list: os.attachments.list.handler(({ context, input }) => call(context, "attachments.list", input)),
	upload: os.attachments.upload.handler(async ({ context, input }) => {
		const uploaded = await call<AttachmentUploadOutput>(context, "attachments.upload", input);
		setLocation(context, `/api/attachments/${uploaded.attachment.id}`);
		return uploaded;
	}),
	get: os.attachments.get.handler(({ context, input }) => call(context, "attachments.get", input)),
	delete: os.attachments.delete.handler(({ context, input }) => call(context, "attachments.delete", input)),
});
