import { z } from "zod";
import { selectConversationFiles } from "../../conversationExport/select";
import type { ConversationAdapter } from "../../conversationExport/types";

const record = z.object({ sessionId: z.string() });

export const claudeConversationExport: ConversationAdapter = {
	encoding: "jsonl",
	select: (identity, inventory) =>
		selectConversationFiles(
			inventory,
			(path) =>
				path.startsWith("projects/") &&
				path.split("/").length === 3 &&
				path.endsWith(`/${identity.providerSessionId}.jsonl`),
			(path, transcript) => path === transcript || path.startsWith(`${transcript.slice(0, -6)}/`),
		),
	identifies(value, sessionId) {
		const parsed = record.safeParse(value);
		if (!parsed.success) return "none";
		return parsed.data.sessionId === sessionId ? "match" : "other";
	},
};
