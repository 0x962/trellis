import type { ChatChannel, ChatMessage, ChatUploadOutput } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const chat = os.chat.router({
	channels: os.chat.channels.handler(({ context, input }) => call(context, "chat.channels", input)),
	createChannel: os.chat.createChannel.handler(async ({ context, input }) => {
		const channel = await call<ChatChannel>(context, "chat.createChannel", input);
		setLocation(context, `/api/projects/${channel.projectId}/chat/${channel.name}/messages`);
		return channel;
	}),
	list: os.chat.list.handler(({ context, input }) => call(context, "chat.list", input)),
	upload: os.chat.upload.handler(async ({ context, input }) => {
		const uploaded = await call<ChatUploadOutput>(context, "chat.upload", input);
		setLocation(context, `/api/chat/attachments/${uploaded.attachment.id}`);
		return uploaded;
	}),
	attachment: os.chat.attachment.handler(({ context, input }) => call(context, "chat.attachment", input)),
	post: os.chat.post.handler(async ({ context, input }) => {
		const message = await call<ChatMessage>(context, "chat.post", input);
		setLocation(context, `/api/projects/${message.projectId}/chat/${message.channel}/messages`);
		return message;
	}),
});
