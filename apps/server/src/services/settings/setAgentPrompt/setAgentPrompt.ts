import { type AgentPromptSetInput, promptTemplateError } from "@trellis/api";
import { contextKeys } from "@trellis/api/agent-guide";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { agentPromptSettings } from "../agentPromptSettings/index.ts";

export async function setAgentPrompt(ctx: ServiceCtx, tx: Tx, input: AgentPromptSetInput) {
	requireActor(ctx);
	const current = await agentPromptSettings(ctx, tx);
	if (input.expectedTemplate !== current.template)
		throw invalidInput(
			"expectedTemplate",
			"The startup prompt differs from your copy. Reopen this setting before you save.",
		);
	if (input.template === null) {
		await tx.execute(sql`DELETE FROM settings WHERE key = 'agentPromptTemplate'`);
	} else {
		const error = promptTemplateError(input.template, contextKeys);
		if (error) throw invalidInput("template", error);
		await tx.execute(sql`INSERT INTO settings (key, value, updated_at)
			VALUES ('agentPromptTemplate', ${JSON.stringify(input.template)}::jsonb, ${ctx.now})
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`);
	}
	return agentPromptSettings(ctx, tx);
}
