import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { setTheme, Toaster } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { AppProvider } from "../../../lib/appContext";
import { StoryContentContext } from "../components/StoryContent";
import type { PreparedStory } from "../prepareStory";
import type { StoryParameters } from "../types";

export function AppStory({
	children,
	prepared: { app, router },
	parameters = {},
	theme,
}: {
	children: ReactNode;
	prepared: PreparedStory;
	parameters?: StoryParameters;
	theme: "light" | "dark";
}) {
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
