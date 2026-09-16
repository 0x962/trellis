import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// A channel name on the wire: an optional `#`, then 1 to 32 characters of
// lower or upper case letters, digits, `_`, and `-`. The service stores the
// lower-case name without the `#`, and `chatChannelName` gives that form.
export const chatChannelPattern = /^#?[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const ChatChannelRefSchema = z
	.string()
	.trim()
	.regex(chatChannelPattern, "Expected a channel name: #ai, #general, or 1 to 32 letters, digits, _ and -.");

export const chatChannelName = (ref: string) => ref.trim().replace(/^#/, "").toLowerCase();

// The channels every project has. The project create and the migration
// insert them, and a delete of them is not offered. `manager` is the direct
// message between a person and the manager of the project.
export const DEFAULT_CHAT_CHANNELS = [
	{ name: "ai", aiOnly: true, direct: false },
	{ name: "general", aiOnly: false, direct: false },
	{ name: "manager", aiOnly: false, direct: true },
] as const;

const BodySchema = z.string().min(1).max(20_000);

export const ChatNotificationSchema = z.object({
	runId: z.string(),
	personaName: z.string(),
	state: z.enum(["pending", "sending", "sent", "failed", "unknown"]),
	error: z.string().nullable(),
	// True when the message mentioned this agent. The send interrupts its turn.
	direct: z.boolean(),
});
export type ChatNotification = z.infer<typeof ChatNotificationSchema>;

export const ChatChannelSchema = z.object({
	projectId: UlidSchema,
	name: z.string(),
	// True for a channel that only agents post in. A person reads it; the web
	// shows no input for it and raises no sound or unread dot for it.
	aiOnly: z.boolean(),
	// True for the direct message channel. A post there reaches the manager
	// of the project only, and only a person or that manager posts in it.
	direct: z.boolean(),
	messageCount: z.number().int().nonnegative(),
	// The id and the time of the newest message, or null for an empty channel.
	// A reader compares `latestId` with the last id it saw to know what is unread.
	latestId: UlidSchema.nullable(),
	lastMessageAt: IsoDateTimeSchema.nullable(),
	createdAt: IsoDateTimeSchema,
});
export type ChatChannel = z.infer<typeof ChatChannelSchema>;

export const ChatMessageSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	channel: z.string(),
	body: BodySchema,
	// The agents that receive this message, with the delivery state of each.
	// Absent when no agent receives it.
	notifications: z.array(ChatNotificationSchema).optional(),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatProjectInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

export const ChatChannelCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	channel: ChatChannelRefSchema,
	aiOnly: z.boolean().optional(),
});
export type ChatChannelCreateInput = z.input<typeof ChatChannelCreateInputSchema>;

// `after` reads the messages that follow one id, oldest first. Without it,
// the list holds the newest `limit` messages, still oldest first.
export const ChatListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	channel: ChatChannelRefSchema,
	after: UlidSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ChatListInput = z.input<typeof ChatListInputSchema>;

export const ChatListSchema = z.object({
	channel: z.string(),
	items: z.array(ChatMessageSchema),
	// The id of the newest message of the channel, or null for an empty one.
	// A reader hands it back as `after` to read only what follows.
	latestId: UlidSchema.nullable(),
});
export type ChatList = z.infer<typeof ChatListSchema>;

// A file posted in a room. `url` is where the bytes are served:
// `/api/chat/attachments/{id}/file`. The blob on disk is addressed by
// `sha256` and is shared with the ticket attachments of the same bytes.
export const ChatAttachmentSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	filename: z.string().min(1).max(255),
	mime: z.string().min(1),
	size: z.number().int().positive(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	url: z.string().min(1),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

// `name` replaces the file's own name when set.
export const ChatUploadInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	file: z.file(),
	name: z.string().min(1).max(255).optional(),
});
export type ChatUploadInput = z.input<typeof ChatUploadInputSchema>;

// `markdown` is the line to put in a message body: an image for an image,
// a link for every other file.
export const ChatUploadOutputSchema = z.object({
	attachment: ChatAttachmentSchema,
	url: z.string().min(1),
	markdown: z.string().min(1),
});
export type ChatUploadOutput = z.infer<typeof ChatUploadOutputSchema>;

export const ChatAttachmentIdInputSchema = z.strictObject({
	id: UlidSchema,
});

export const ChatPostInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	channel: ChatChannelRefSchema,
	body: BodySchema,
});
export type ChatPostInput = z.input<typeof ChatPostInputSchema>;
