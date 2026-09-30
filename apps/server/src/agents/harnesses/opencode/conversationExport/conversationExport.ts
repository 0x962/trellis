import { z } from "zod";
import { selectConversationFiles } from "../../conversationExport/select";
import type { ConversationAdapter } from "../../conversationExport/types";

const archive = z.object({ info: z.object({ id: z.string() }), messages: z.array(z.unknown()) });

export const opencodeConversationExport: ConversationAdapter = {
	encoding: "json",
	select: (_identity, inventory) =>
		inventory.sourceKind === "opencode-export"
			? selectConversationFiles(inventory, (path) => path === "session.json")
			: { state: "unavailable", reason: "provider_export_required" },
	identifies(value, sessionId) {
		const parsed = archive.safeParse(value);
		if (!parsed.success) return "none";
		return parsed.data.info.id === sessionId ? "match" : "other";
	},
};
