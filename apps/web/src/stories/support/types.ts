import type { AnyRoute } from "@tanstack/react-router";
import type { LiveStatus } from "../../lib/live";

export type StoryResponse = unknown | ((input: unknown, signal?: AbortSignal) => unknown | Promise<unknown>);

export type StoryParameters = {
	responses?: Record<string, StoryResponse>;
	path?: string;
	routePath?: string;
	route?: AnyRoute;
	loadRoute?: boolean;
	liveStatus?: LiveStatus;
	actor?: string | null;
	toaster?: boolean;
};
