import { z } from "zod";
import { selectConversationFiles } from "../../conversationExport/select";
import type { ConversationAdapter } from "../../conversationExport/types";

const header = z.object({ type: z.literal("session"), id: z.string() });

export const piConversationExport: ConversationAdapter = {
	encoding: "jsonl",
	select: (identity, inventory) =>
		selectConversationFiles(
			inventory,
			(path) => path.endsWith(`_${identity.providerSessionId}.jsonl`),
		),
	identifies(value, sessionId) {
		const parsed = header.safeParse(value);
		if (!parsed.success) return "none";
		return parsed.data.id === sessionId ? "match" : "other";
	},
};
