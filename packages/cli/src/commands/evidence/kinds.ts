import { EvidenceWriteInputSchema } from "@trellis/api";

export type CaptureInput = {
	id: string;
	evidenceId: string;
	headSha: string;
	baseSha: string;
	route: string;
	viewport: string;
	theme: string;
	seed: string;
	browser: string;
	capturedAt: string;
};

export const captureInput = (input: CaptureInput) =>
	EvidenceWriteInputSchema.parse({
		id: input.id,
		evidenceId: input.evidenceId,
		headSha: input.headSha,
		kind: "capture",
		record: {
			headSha: input.headSha,
			baseSha: input.baseSha,
			route: input.route,
			viewport: input.viewport,
			theme: input.theme,
			seed: input.seed,
			browser: input.browser,
			capturedAt: input.capturedAt,
		},
	});
