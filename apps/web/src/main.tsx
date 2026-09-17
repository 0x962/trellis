import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { applyEvent, realScheduler } from "@trellis/api";
import { DesktopChrome } from "@trellis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { type AppContext, AppProvider } from "./lib/appContext";
import type { DesktopBridge } from "./lib/desktopBridge";
import { hasMacDesktopChrome } from "./lib/desktopChrome";
import { createLive } from "./lib/live";
import { client, orpc, queryClient } from "./lib/orpc";
import { preloadOnIdle } from "./lib/preloadOnIdle";
import { preloadRouteChunks } from "./lib/preloadRouteChunks";
import { createAppRouter } from "./router";

// The browser's own locks, channel, and EventSource. One tab per origin
// holds the trellis-sse lock and owns the connection. Every event updates
// the cache.
const live = createLive({
	queryClient,
	locks: navigator.locks,
	createChannel: (name) => new BroadcastChannel(name),
	EventSource,
	scheduler: realScheduler,
	applyEvent,
});
live.start();

const context: AppContext = { queryClient, orpc, client, live, scheduler: realScheduler };
const router = createAppRouter(context);
const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
desktop?.onNavigate?.((path) => void router.navigate({ href: path }));
preloadOnIdle(() => preloadRouteChunks(router));

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<AppProvider value={context}>
				<DesktopChrome enabled={hasMacDesktopChrome(desktop)}>
					<RouterProvider router={router} />
				</DesktopChrome>
			</AppProvider>
		</QueryClientProvider>
	</StrictMode>,
);
