import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { setTheme, Toaster } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { AppProvider } from "../../../lib/appContext";
import type { loadStoryApp } from "../loadStoryApp";
import type { StoryParameters } from "../types";
import { StoryContentContext } from "../StoryContent";

export function AppStory({
	children,
	parameters = {},
	theme,
	loaded,
}: {
	children: ReactNode;
	parameters?: StoryParameters;
	theme: "light" | "dark";
	loaded: Awaited<ReturnType<typeof loadStoryApp>>;
}) {
	const { app, router } = loaded;
	useEffect(() => setTheme(theme), [theme]);
	useEffect(() => () => app.queryClient.clear(), [app]);
	return (
		<AppProvider value={app}>
			<QueryClientProvider client={app.queryClient}>
				<div className="h-screen min-h-0 bg-bg text-fg">
					<StoryContentContext.Provider value={children}>
						<RouterProvider router={router} />
					</StoryContentContext.Provider>
					{parameters.toaster !== false && <Toaster />}
				</div>
			</QueryClientProvider>
		</AppProvider>
	);
}
