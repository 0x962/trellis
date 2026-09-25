// One message of a review thread, as the review page passes it in.
export type Message = {
	id: string;
	author: string;
	kind: string;
	session: string | null;
	body: string;
	createdAt: string;
	version: number;
	reactions: { reaction: string; author: string; kind: string }[];
	// How far this message got on its way to the agents of the pull request.
	// A message that Trellis sends to no agent holds nothing here.
	delivery?: { state: string; error: string | null } | null;
};

// The first message of a thread, the replies under it, and the state a
// reader can change.
export type Thread = Message & {
	// `threadId` identifies the thread when `id` identifies its first message.
	threadId?: string;
	replies: Message[];
	status: string;
	resolvedBy: string | null;
};

// The message the reader has open in the edit form, and the text they have
// typed so far. `version` is the version they started from, which the server
// compares against before it writes.
export type Edit = { id: string; body: string; version: number };
