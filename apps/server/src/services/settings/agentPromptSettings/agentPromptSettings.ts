import type { AgentPromptSettings } from "@trellis/api";
import { contextKeys, defaultAgentPrompt } from "@trellis/api/agent-guide";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function agentPromptSettings(_ctx: ServiceCtx, tx: Tx): Promise<AgentPromptSettings> {
	const [stored] = await rows<{ value: string }>(tx, sql`SELECT value FROM settings WHERE key = 'agentPromptTemplate'`);
	return {
		template: stored?.value ?? defaultAgentPrompt,
		defaultTemplate: defaultAgentPrompt,
		variables: contextKeys,
		isCustom: stored !== undefined,
	};
}
