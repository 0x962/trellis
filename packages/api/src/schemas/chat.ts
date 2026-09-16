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
// insert them, and a delete of them is not offered.
export const DEFAULT_CHAT_CHANNELS = ["ai", "general"] as const;

const BodySchema = z.string().min(1).max(20_000);

export const ChatNotificationSchema = z.object({
	runId: z.string(),
	personaName: z.string(),
	state: z.enum(["pending", "sending", "sent", "failed", "unknown"]),
	error: z.string().nullable(),
});
export type ChatNotification = z.infer<typeof ChatNotificationSchema>;

export const ChatChannelSchema = z.object({
	projectId: UlidSchema,
	name: z.string(),
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

export const ChatPostInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	channel: ChatChannelRefSchema,
	body: BodySchema,
});
export type ChatPostInput = z.input<typeof ChatPostInputSchema>;
