import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { realScheduler } from "@trellis/api";
import type { AppContext } from "../../../lib/appContext";
import { createStatusStore } from "../../../lib/live";
import { createStoryClient } from "../createStoryClient";
import type { StoryParameters } from "../types";

export const createStoryApp = (parameters: StoryParameters): AppContext => {
	const client = createStoryClient(parameters.responses ?? {}, (procedure, configured) => {
		window.dispatchEvent(new CustomEvent("trellis:story-request", { detail: { procedure, configured } }));
	});
	return {
		client,
		orpc: createTanstackQueryUtils(client),
		queryClient: new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false },
				mutations: { retry: false },
			},
		}),
		scheduler: realScheduler,
		live: {
			status: createStatusStore(parameters.liveStatus ?? "live"),
			start: () => {},
			stop: async () => {},
			isLeader: () => false,
			lastId: () => null,
			bootId: () => "storybook",
		},
	};
};
