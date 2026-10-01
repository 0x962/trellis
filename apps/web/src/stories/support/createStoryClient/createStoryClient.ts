import { createORPCClient } from "@orpc/client";
import type { TrellisClient } from "@trellis/api";
import type { StoryResponse } from "../types";

export const createStoryClient = (
	responses: Record<string, StoryResponse>,
	onRequest?: (procedure: string, configured: boolean) => void,
) =>
	createORPCClient<TrellisClient>({
		call: async (path, input, options) => {
			const procedure = path.join(".");
			onRequest?.(procedure, Object.hasOwn(responses, procedure));
			if (!Object.hasOwn(responses, procedure)) {
				throw new Error(`Story fixture is missing: ${procedure}`);
			}
			const response = responses[procedure];
			const value = typeof response === "function" ? await response(input, options.signal) : response;
			return structuredClone(value);
		},
	});
