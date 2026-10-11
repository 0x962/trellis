import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PreparedStory } from "../../support/prepareStory";
import { actualSourceResponses } from "./actualSourceFixture";
import { navigationFixtures } from "./navigationFixtures";

function ActualSourceNavigation() {
	return null;
}

const meta = {
	title: "Pages/Navigation/Actual source",
	component: ActualSourceNavigation,
	parameters: {
		trellis: {
			generatedRouter: true,
			preserveNavigationPreferences: true,
			path: "/p/ATL/epics/interface-review",
			responses: actualSourceResponses,
		},
	},
} satisfies Meta<typeof ActualSourceNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RepresentativeRoutes: Story = {
	play: async ({ canvasElement, loaded }) => {
		const canvas = within(canvasElement);
		const page = within(canvasElement.ownerDocument.body);
		const { router } = loaded.appStory as PreparedStory;

		await expect(await canvas.findByText("Interface review", { selector: "h1 *" })).toBeVisible();
		await expect(router.state.location.pathname).toBe("/p/ATL/epics/interface-review");
		await expect(canvas.getByRole("link", { name: "Epics" })).toHaveAttribute("aria-current", "page");
		await expect(canvas.getByLabelText("2 agents are active")).toBeVisible();
		await expect(canvas.getByText("Needs input:", { exact: true })).toBeInTheDocument();
		const scroll = canvasElement.querySelector<HTMLElement>("[data-sidebar-scroll]")!;
		await expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);

		const projectSessions = canvasElement.querySelector<HTMLAnchorElement>('a[href="/sessions/project/ATL"]')!;
		await userEvent.click(projectSessions);
		await waitFor(() => expect(router.state.location.pathname).toBe("/sessions/project/ATL"));
		await expect(await canvas.findByRole("navigation", { name: "Project sessions" })).toBeVisible();
		await expect(projectSessions).toHaveAttribute("aria-current", "page");
		for (const session of navigationFixtures.projectSessions) {
			await expect(await canvas.findByTitle(new RegExp(`^${session.name}.* · `))).toBeVisible();
		}
		await expect(canvas.getByText("Needs input", { exact: true })).toBeVisible();

		await router.navigate({
			to: "/reviews/$owner/$repo/$number",
			params: { owner: "example", repo: "trellis", number: "42" },
		});
		await waitFor(() => expect(router.state.location.pathname).toBe("/reviews/example/trellis/42"));
		await expect(await canvas.findByText("Keep the ticket title readable at every screen width")).toBeVisible();
		await expect(canvasElement.querySelector(".sidebar-selected")).not.toBeInTheDocument();

		const search = canvasElement.querySelector<HTMLAnchorElement>('a[href="/search"]')!;
		await userEvent.click(search);
		await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
		await expect(await canvas.findByRole("searchbox", { name: "Search" })).toBeVisible();
		await expect(search).toHaveAttribute("aria-current", "page");

		const settings = canvas.getByRole("link", { name: "Settings" });
		await userEvent.click(settings);
		const settingsSheet = await page.findByRole("dialog", { name: "Settings" });
		const accountHeading = within(settingsSheet)
			.getAllByRole("heading", { name: "Account", hidden: true })
			.find((heading) => heading.closest("[hidden]") === null)!;
		await waitFor(() => expect(accountHeading).toBeVisible());
		await userEvent.click(within(settingsSheet).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(page.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument());
		await expect(settings).toHaveFocus();
	},
};
