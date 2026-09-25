import { expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTrellisClient, type MenuLink } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { MenuLinkEditor } from "./components/MenuLinkEditor";
import { MenuLinks } from "./MenuLinks";

const url = "https://github.com/0x962/trellis/actions";

test("settings show saved order, edits, and deletions from the shared cache", () => {
	const client = createTrellisClient("http://localhost", () => null);
	const orpc = createTanstackQueryUtils(client);
	const queryClient = new QueryClient();
	const context = { client, orpc, queryClient } as AppContext;
	const link: MenuLink = { id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f", label: "Actions", icon: "GithubLogo", url };
	const other: MenuLink = { ...link, id: "128f08be-daf8-4999-abcc-27e20a5d81bd", label: "Docs", icon: "BookOpen" };
	const render = (menuLinks: MenuLink[]) => {
		queryClient.setQueryData(orpc.settings.get.queryKey({}), { defaultActorName: "test", menuLinks });
		return renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={context}>
					<MenuLinks />
				</AppProvider>
			</QueryClientProvider>,
		);
	};
	const initial = render([other, link]);
	expect(initial.indexOf(">Docs<")).toBeLessThan(initial.indexOf(">Actions<"));
	expect(render([other, { ...link, label: "Builds" }])).toContain(">Builds<");
	expect(render([other])).not.toContain(">Actions<");
	expect(render([])).toContain("No menu links.");
	queryClient.clear();
});

test("the row editor exposes label, URL, and icon controls", () => {
	const html = renderToStaticMarkup(
		<MenuLinkEditor link={null} busy={false} onCancel={() => {}} onSave={async () => {}} />,
	);
	for (const label of ["Label", "HTTPS URL", "Icon", "Save", "Cancel"]) expect(html).toContain(label);
});
