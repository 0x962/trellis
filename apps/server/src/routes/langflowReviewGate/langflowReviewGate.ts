import { Hono } from "hono";
import { z, ZodError } from "zod";
import { readClassificationContext } from "../../services/langflowGates/readClassificationContext";
import type { ClassificationDependencies } from "../../services/langflowGates/classifyReviewArea";
import { invokeReviewGate, type ReviewGateInvocationCtx } from "../../services/langflowGates/invokeReviewGate";

export type ReviewGateRouteOptions = {
	context(): Promise<ReviewGateInvocationCtx>;
};

export function langflowReviewGate(options: ReviewGateRouteOptions, provider?: ClassificationDependencies) {
	const app = new Hono();
	const path = "/api/langflow-private/v1/review-gates";
	for (const [endpoint, operation] of [[path, invokeReviewGate], [`${path}/context`, readClassificationContext]] as const) {
		app.post(endpoint, async (c) => {
			const authorization = c.req.header("Authorization");
			if (!authorization?.startsWith("Bearer ")) return c.json({ code: "UNAUTHORIZED" }, 401);
			const origin = c.req.header("Origin");
			if (origin !== undefined && origin !== new URL(c.req.url).origin) return c.json({ code: "FORBIDDEN" }, 403);
			const capabilityId = c.req.header("X-Trellis-Capability-Id");
			if (!capabilityId) return c.json({ code: "authority_conflict" }, 403);
			try {
				const envelope = z.strictObject({ requestBytes: z.string(), authorityBytes: z.string() }).parse(await c.req.json());
				const ctx = await options.context();
				return c.json(await operation(ctx, { ...envelope, capabilityId, authorization }, provider));
			} catch (error) {
				if (error instanceof ZodError || error instanceof SyntaxError)
					return c.json({ code: "review_gate_invalid_request" }, 400);
				if (error instanceof Error && error.message === "sidecar_authentication_denied")
					return c.json({ code: "UNAUTHORIZED" }, 401);
				if (error instanceof Error && ["authority_conflict", "owner_revoked"].includes(error.message))
					return c.json({ code: error.message }, 403);
				if (error instanceof Error && [
					"execution_publication_conflict", "review_gate_identity_conflict", "review_gate_occurrence_conflict", "review_gate_publication_conflict",
					"review_gate_node_conflict", "review_gate_definition_conflict", "classification_conflict", "execution_terminal",
				].includes(error.message)) return c.json({ code: error.message }, 409);
				throw error;
			}
		});
	}
	return app;
}
