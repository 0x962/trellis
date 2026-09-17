import { pickErrors } from "../errors.ts";
import {
	EvidenceArtifactSchema,
	EvidenceCheckInputSchema,
	EvidenceCheckSchema,
	EvidenceFileInputSchema,
	EvidenceFileSchema,
	EvidenceHistoryInputSchema,
	EvidenceHistorySchema,
	EvidenceListSchema,
	EvidenceRunInputSchema,
	EvidenceWorkspaceSchema,
} from "../schemas/evidence.ts";
import { base } from "./base.ts";

export const evidence = {
	workspace: base
		.route({ method: "GET", path: "/agent-runs/{runId}/workspace", summary: "Inspect the agent workspace" })
		.input(EvidenceRunInputSchema)
		.output(EvidenceWorkspaceSchema),
	file: base
		.route({ method: "GET", path: "/agent-runs/{runId}/workspace/file", summary: "Read a workspace file" })
		.input(EvidenceFileInputSchema)
		.output(EvidenceFileSchema),
	check: base
		.route({ method: "POST", path: "/agent-runs/{runId}/checks", summary: "Run and retain a workspace check" })
		.input(EvidenceCheckInputSchema)
		.output(EvidenceCheckSchema),
	register: base
		.route({ method: "POST", path: "/agent-runs/{runId}/artifacts", summary: "Register a workspace artifact" })
		.input(EvidenceFileInputSchema)
		.output(EvidenceArtifactSchema),
	history: base
		.errors(pickErrors(["INVALID_CURSOR"]))
		.route({
			method: "GET",
			path: "/agent-runs/{runId}/evidence/history",
			summary: "Read retained checks and artifacts without a workspace",
		})
		.input(EvidenceHistoryInputSchema)
		.output(EvidenceHistorySchema),
	list: base
		.route({
			method: "GET",
			path: "/agent-runs/{runId}/evidence",
			summary: "Inspect current check and artifact evidence",
		})
		.input(EvidenceRunInputSchema)
		.output(EvidenceListSchema),
};
