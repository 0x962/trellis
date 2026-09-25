import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { PageDetail } from "./PageDetail";

for (const [code, title] of [
	["FORBIDDEN", "Access to this Page was refused"],
	["NOT_FOUND", "This Page does not exist"],
	["INTERNAL_SERVER_ERROR", "The Page did not load"],
] as const) {
	test(`shows ${code} after a cached Page fails to refresh`, async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const queryKey = ["pages", "get", "TRL/pages/report"];
		queryClient.setQueryData(queryKey, { title: "Cached Page" });
		const queryOptions = {
			queryKey,
			queryFn: async () => {
				throw new ORPCError(code);
			},
		};
		await expect(queryClient.fetchQuery(queryOptions)).rejects.toMatchObject({ code });
		expect(queryClient.getQueryData<{ title: string }>(queryKey)).toEqual({ title: "Cached Page" });
		const app = {
			queryClient,
			orpc: { pages: { get: { queryOptions: () => queryOptions } } },
		} as unknown as AppContext;
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<PageDetail project={{ key: "TRL" } as Project} slug="report" search={{}} />
				</AppProvider>
			</QueryClientProvider>,
		);
		expect(html).toContain(title);
		expect(html).not.toContain("Cached Page");
		queryClient.clear();
	});
}
