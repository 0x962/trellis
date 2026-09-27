import { sql } from "drizzle-orm";
import { z } from "zod";
import { rows } from "../../../db/queries/support.ts";
import type { ServiceCtx } from "../../support.ts";
import type { ProviderFetch } from "../remote.ts";
import { keyOf } from "../secret.ts";

type EvaluationInput = {
	state: unknown;
	questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }>;
};
const answerSchema = z.object({
	answers: z.record(z.string(), z.object({ type: z.literal("choice"), choice: z.string() })),
});

export async function evaluate(
	ctx: Pick<ServiceCtx, "newTx" | "log">,
	input: EvaluationInput,
	fetcher: ProviderFetch = fetch,
): Promise<z.infer<typeof answerSchema>> {
	const provider = await ctx.newTx(async (tx) => {
		const [row] = await rows<{ id: string; base_url: string }>(
			tx,
			sql`
			SELECT p.id,p.base_url FROM providers p JOIN provider_models m ON m.provider_id=p.id
			WHERE p.enabled AND p.kind='vercel-ai-gateway' AND m.model_id='typesafe-ai/jev'
			ORDER BY p.created_at,p.id LIMIT 1`,
		);
		if (!row) throw new Error("Jev needs an enabled Vercel provider that offers typesafe-ai/jev.");
		return { id: row.id, baseUrl: row.base_url, apiKey: await keyOf(tx, row.id) };
	});
	const fields = { providerId: provider.id, host: new URL(provider.baseUrl).host, model: "typesafe-ai/jev" };
	ctx.log("provider.evaluate.request", fields);
	let response: Response;
	try {
		response = await fetcher(`${provider.baseUrl}/v1/evaluate`, {
			method: "POST",
			headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
			redirect: "manual",
			signal: AbortSignal.timeout(30_000),
			body: JSON.stringify({ model: fields.model, ...input }),
		});
	} catch {
		ctx.log("provider.evaluate.failure", { ...fields, status: null, error: "The Jev request failed or timed out." });
		throw new Error("The Jev request failed or timed out.");
	}
	if (!response.ok) {
		ctx.log("provider.evaluate.failure", { ...fields, status: response.status, error: "HTTP error" });
		throw new Error(`The Jev request failed with HTTP ${response.status}.`);
	}
	let answer: z.infer<typeof answerSchema>;
	try {
		answer = answerSchema.parse(await response.json());
		for (const [key, question] of Object.entries(input.questions)) {
			const choice = answer.answers[key]?.choice;
			if (choice === undefined || !Object.hasOwn(question.criteria, choice)) throw new Error("Invalid choice");
		}
		answer = { answers: Object.fromEntries(Object.keys(input.questions).map((key) => [key, answer.answers[key]!])) };
	} catch {
		ctx.log("provider.evaluate.failure", { ...fields, status: response.status, error: "Invalid evaluation response" });
		throw new Error("Jev returned an invalid evaluation response.");
	}
	ctx.log("provider.evaluate.result", {
		...fields,
		status: response.status,
		choices: Object.fromEntries(Object.entries(answer.answers).map(([key, answer]) => [key, answer.choice])),
	});
	return answer;
}
