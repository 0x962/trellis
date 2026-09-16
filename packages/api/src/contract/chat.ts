import { pickErrors } from "../errors.ts";
import {
	ChatAttachmentIdInputSchema,
	ChatAttachmentSchema,
	ChatChannelCreateInputSchema,
	ChatChannelSchema,
	ChatListInputSchema,
	ChatListSchema,
	ChatMessageSchema,
	ChatPostInputSchema,
	ChatProjectInputSchema,
	ChatUploadInputSchema,
	ChatUploadOutputSchema,
} from "../schemas/chat.ts";
import { base } from "./base.ts";

const archived = pickErrors(["PROJECT_ARCHIVED"]);

export const chat = {
	channels: base
		.route({ method: "GET", path: "/projects/{project}/chat", summary: "List the chat channels of a project" })
		.input(ChatProjectInputSchema)
		.output(ChatChannelSchema.array()),
	createChannel: base
		.errors({ ...archived, ...pickErrors(["DUPLICATE"]) })
		.route({
			method: "POST",
			path: "/projects/{project}/chat",
			successStatus: 201,
			summary: "Create a chat channel",
		})
		.input(ChatChannelCreateInputSchema)
		.output(ChatChannelSchema),
	list: base
		.route({
			method: "GET",
			path: "/projects/{project}/chat/{channel}/messages",
			summary: "Read the messages of a chat channel",
		})
		.input(ChatListInputSchema)
		.output(ChatListSchema),
	upload: base
		.errors({ ...archived, ...pickErrors(["PAYLOAD_TOO_LARGE"]) })
		.route({
			method: "POST",
			path: "/projects/{project}/chat/attachments",
			successStatus: 201,
			summary: "Upload a file for a chat message as multipart form data",
		})
		.input(ChatUploadInputSchema)
		.output(ChatUploadOutputSchema),
	attachment: base
		.route({ method: "GET", path: "/chat/attachments/{id}", summary: "Read chat attachment metadata" })
		.input(ChatAttachmentIdInputSchema)
		.output(ChatAttachmentSchema),
	post: base
		.errors({ ...archived, ...pickErrors(["CHAT_AI_ONLY"]) })
		.route({
			method: "POST",
			path: "/projects/{project}/chat/{channel}/messages",
			successStatus: 201,
			summary: "Post a chat message",
		})
		.input(ChatPostInputSchema)
		.output(ChatMessageSchema),
};
