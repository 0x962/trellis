import { z } from "zod";
import { selectConversationFiles } from "../../conversationExport/select";
import type { ConversationAdapter } from "../../conversationExport/types";

const metadata = z.object({ type: z.literal("session_meta"), payload: z.object({ id: z.string() }) });

export const codexConversationExport: ConversationAdapter = {
	encoding: "jsonl",
	select: (identity, inventory) =>
		selectConversationFiles(
			inventory,
			(path) => path.split("/").at(-1)!.endsWith(`-${identity.providerSessionId}.jsonl`),
		),
	identifies(value, sessionId) {
		const parsed = metadata.safeParse(value);
		if (!parsed.success) return "none";
		return parsed.data.payload.id === sessionId ? "match" : "other";
	},
};
