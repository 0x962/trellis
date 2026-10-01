import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { setTheme, Toaster } from "@trellis/ui";
import { type ReactNode, useEffect, useState } from "react";
import { AppProvider } from "../../../lib/appContext";
import { createStoryApp } from "../createStoryApp";
import { createStoryRouter } from "../createStoryRouter";
import type { StoryParameters } from "../types";
import { StoryContent, StoryContentContext } from "./components/StoryContent";

export function AppStory({
	children,
	parameters = {},
	theme,
}: {
	children: ReactNode;
	parameters?: StoryParameters;
	theme: "light" | "dark";
}) {
	const [app] = useState(() => createStoryApp(parameters));
	const [router] = useState(() => createStoryRouter(app, parameters, () => <StoryContent />));
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
