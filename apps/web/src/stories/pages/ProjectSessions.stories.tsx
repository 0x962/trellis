import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ProjectSessionsPage } from "../../features/sessions/ProjectSessionsPage";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { sessionResponses } from "./fixtures/session";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Project sessions",
	component: ProjectSessionsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/sessions/project/DEMO", responses: sessionResponses } },
} satisfies Meta<typeof ProjectSessionsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const sessions = within(await canvas.findByRole("navigation", { name: "Project sessions" }));
		await expect(await sessions.findByRole("button", { name: /^Review the ticket layout\b/ })).toBeVisible();
		await expect(await canvas.findByRole("region", { name: "Review the ticket layout conversation" })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": { items: [], nextCursor: null }, "sessions.list": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": pending, "sessions.list": pending } } },
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": failure, "sessions.list": failure } } },
};
export const ArchivedProject: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };

export const TitleAtHighZoom: Story = {
	globals: { viewport: { value: "zoomed", isRotated: false } },
	parameters: {
		viewport: { options: { zoomed: { name: "160 CSS pixels", styles: { width: "160px", height: "450px" } } } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const title = await canvas.findByRole("button", { name: /^Sessions$/ });
		await document.fonts.ready;
		const topbar = title.closest("header");
		const parent = within(topbar!).getByRole("link", { name: project.name });
		const label = title.querySelector("span")!;
		const parentLabel = parent.querySelector("span:last-child")!;
		await expect(window.innerWidth).toBe(160);
		await expect(document.documentElement.scrollWidth).toBe(160);
		await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
		await expect(parentLabel.getBoundingClientRect().width).toBeGreaterThan(0);
		await expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(parent.getBoundingClientRect().bottom);
		await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
			title.closest("h1")!.getBoundingClientRect().right,
		);
		for (const control of [parent, title]) {
			await expect(control.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
			await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
			control.focus();
			await expect(control).toHaveFocus();
			await expect(getComputedStyle(control).outlineWidth).toBe("2px");
		}
	},
};
