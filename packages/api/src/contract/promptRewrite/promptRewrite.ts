import { pickErrors } from "../../errors.ts";
import { PromptRewriteInputSchema, PromptRewriteOutputSchema } from "../../schemas/promptRewrite/index.ts";
import { base } from "../base.ts";

export const promptRewrite = {
	rewrite: base
		.errors(pickErrors(["PROMPT_REWRITE_UNAVAILABLE", "PROMPT_REWRITE_FAILED"]))
		.route({ method: "POST", path: "/prompt-rewrite", summary: "Rewrite text as a clear agent prompt" })
		.input(PromptRewriteInputSchema)
		.output(PromptRewriteOutputSchema),
};
