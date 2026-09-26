import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PageSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { PageWatcher } from "./PageWatcher";

const page = {
	id: "page",
	projectId: "project",
	watcher: { agent: { id: "watcher", name: "Stopped watcher" } },
} as PageSummary;
const render = (disabled: boolean, loaded: boolean) => {
	const queryClient = new QueryClient();
	const queryKey = ["watcher-agents"];
	if (loaded) queryClient.setQueryData(queryKey, []);
	const app = {
		orpc: { pages: { watcherOptions: { queryOptions: () => ({ queryKey, queryFn: async () => [] }) } } },
	} as unknown as AppContext;
	const html = renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<PageWatcher page={page} disabled={disabled} />
			</AppProvider>
		</QueryClientProvider>,
	);
	queryClient.clear();
	return html;
};

test("keeps the watcher name when the agent list omits its stopped process", () => {
	const html = render(false, true);
	expect(html).toContain("Stopped watcher");
	expect(html).toContain('aria-label="Page watcher"');
	expect(html).not.toContain('aria-disabled="true"');
});

test("blocks the selector on historical, deleted, archived, or offline pages", () => {
	expect(render(true, true)).toContain('aria-disabled="true"');
});

test("keeps the assigned name while agents load and blocks a premature mutation", () => {
	const html = render(false, false);
	expect(html).toContain("Stopped watcher");
	expect(html).toContain('aria-disabled="true"');
});
