import { reviewRef } from "@trellis/api";
import { invalidInput } from "../../errors";
import type { ServiceCtx } from "../support";
import { type RunInput, runRequest } from "./runAdapter";
export async function runs(_ctx: ServiceCtx, input: RunInput) {
	const request = runRequest(input);
	const root = `${process.env.TRELLIS_REVIEW_EXECUTOR_URL ?? "http://dots.localhost"}/api/graphs/review/runs`;
	const read = async (path: string) => {
		const response = await fetch(`${root}${path}`, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) throw invalidInput("executor", await response.text());
		return (await response.json()) as Record<string, unknown>;
	};
	if (input.runId) {
		const run = await read(`/${input.runId}`);
		if (reviewRef(String(run.target)).url !== reviewRef(input.pr).url)
			throw invalidInput("runId", "The run belongs to another PR.");
	}
	const response = await fetch(`${root}${request.path}`, {
		method: request.method,
		headers: { "content-type": "application/json" },
		body: request.body === undefined ? undefined : JSON.stringify(request.body),
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok) throw invalidInput("executor", await response.text());
	const data = (await response.json()) as Record<string, unknown>;
	if (input.action === "list")
		data.runs = (data.runs as { target: string }[]).filter((r) => r.target === reviewRef(input.pr).url);
	return data;
}
