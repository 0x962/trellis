import {
	EvidenceArtifactSchema,
	EvidenceFileInputSchema,
	EvidenceFileSchema,
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
	register: base
		.route({ method: "POST", path: "/agent-runs/{runId}/artifacts", summary: "Register a workspace artifact" })
		.input(EvidenceFileInputSchema)
		.output(EvidenceArtifactSchema),
	list: base
		.route({
			method: "GET",
			path: "/agent-runs/{runId}/evidence",
			summary: "Inspect historical checks and current artifacts",
		})
		.input(EvidenceRunInputSchema)
		.output(EvidenceListSchema),
};
