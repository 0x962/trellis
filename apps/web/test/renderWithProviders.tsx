import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterContextProvider, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { realScheduler, type Scheduler, type TrellisClient } from "@trellis/api";
import type { ReactElement } from "react";
import { setActorName } from "../src/lib/actor";
import { type AppContext, AppProvider } from "../src/lib/appContext";
import { createStatusStore, type Live, type LiveStatus } from "../src/lib/live";
import { createOrpc, type Orpc } from "../src/lib/orpc";
import { createAppRouter } from "../src/router";
import { createTestServer, type TestServer } from "./server/index.ts";

export type ProviderOptions = {
	// The URL the router starts at, with its search string.
	path: string;
	// The stored identity. Omitted, the test starts as a first run.
	actor?: string;
	server?: TestServer;
	// The connection status the shell sees. Live by default.
	liveStatus?: LiveStatus;
	scheduler?: Scheduler;
	// A previous render's wiring. A second mount over it reads the cache the
	// first one filled.
	harness?: Harness;
	// Runs before the first render with the fresh cache, so a test can seed
	// an entry the component reads on its first paint.
	prime?: (wired: { queryClient: QueryClient; orpc: Orpc; client: TrellisClient }) => void;
};

export type Harness = ReturnType<typeof wire>;

// A `Live` with a status the test sets and no connection of its own.
const stubLive = (status: LiveStatus): Live => ({
	status: createStatusStore(status),
	start: () => {},
	stop: async () => {},
	isLeader: () => true,
	lastId: () => null,
	bootId: () => null,
});

// The providers' parts for one test: the server, the clients, the live
// stub, and a memory-history router at `path`.
export const wire = (options: ProviderOptions) => {
	if (options.actor !== undefined) setActorName(options.actor);
	const server = options.server ?? createTestServer();
	const { client, orpc, queryClient } = createOrpc({ fetch: server.fetch });
	const live = stubLive(options.liveStatus ?? "live");
	const context: AppContext = { queryClient, orpc, client, live, scheduler: options.scheduler ?? realScheduler };
	const router = createAppRouter(context, createMemoryHistory({ initialEntries: [options.path] }));
	options.prime?.({ queryClient, orpc, client });
	return { server, client, orpc, queryClient, live, context, router };
};

// The wiring on its own, for a test that fills the cache before it renders.
export const createHarness = (options: ProviderOptions) => wire(options);

// Renders `ui` inside the providers the app mounts: a fresh QueryClient, a
// trellis client over the test server, and a memory-history router at
// `path`. The router provides context to Links but renders no route, so
// `ui` is what the test sees.
export const renderWithProviders = (ui: ReactElement, options: ProviderOptions) => {
	const wired = options.harness ?? wire(options);
	const view = render(
		<QueryClientProvider client={wired.queryClient}>
			<AppProvider value={wired.context}>
				<RouterContextProvider router={wired.router}>{ui}</RouterContextProvider>
			</AppProvider>
		</QueryClientProvider>,
	);
	return { ...screen, ...view, ...wired };
};

// Renders the whole app at `path`: the root shell and the matched route.
export const renderApp = (options: ProviderOptions) => {
	const wired = options.harness ?? wire(options);
	const view = render(
		<QueryClientProvider client={wired.queryClient}>
			<AppProvider value={wired.context}>
				<RouterProvider router={wired.router} />
			</AppProvider>
		</QueryClientProvider>,
	);
	return { ...screen, ...view, ...wired };
};
