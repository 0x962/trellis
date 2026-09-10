import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { realScheduler } from "@trellis/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { type AppContext, AppProvider } from "./lib/appContext";
import { createLive } from "./lib/live";
import { client, orpc, queryClient } from "./lib/orpc";
import { preloadOnIdle } from "./lib/preloadOnIdle";
import { preloadRouteChunks } from "./lib/preloadRouteChunks";
import { createAppRouter } from "./router";

// The browser's own locks, channel, and EventSource. One tab per origin
// holds the trellis-sse lock and owns the connection.
const live = createLive({
	queryClient,
	locks: navigator.locks,
	createChannel: (name) => new BroadcastChannel(name),
	EventSource,
	scheduler: realScheduler,
});
live.start();

const context: AppContext = { queryClient, orpc, client, live, scheduler: realScheduler };
const router = createAppRouter(context);
preloadOnIdle(() => preloadRouteChunks(router));

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<AppProvider value={context}>
				<RouterProvider router={router} />
			</AppProvider>
		</QueryClientProvider>
	</StrictMode>,
);
