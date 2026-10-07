import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouterState } from "@tanstack/react-router";
import type { PageGetInput } from "@trellis/api";
import { expect, userEvent, within } from "storybook/test";
import { PageDetail } from "../../features/pages/PageDetail";
import { historicalPageThread, page, pageLease, pageResponses, pageThread } from "./fixtures/page";
import { actor, archivedProject, failure, pending, project, timestamp } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Page detail",
	component: PageDetail,
	args: { project, slug: page.slug, search: {} },
	parameters: {
		layout: "fullscreen",
		a11y: { options: { iframes: false } },
		trellis: { path: "/p/DEMO/pages/interface-review", responses: pageResponses },
	},
} satisfies Meta<typeof PageDetail>;
export default meta;
type Story = StoryObj<typeof meta>;
const historicalLease = () => ({ ...pageLease(), version: 1 });

export const Populated: Story = {};
export const EmptyComments: Story = {
	parameters: {
		trellis: { responses: { "pages.comments": [], "pages.get": { ...page, openThreadCount: 0, totalThreadCount: 0 } } },
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "pages.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "pages.get": failure } } } };
export const Missing: Story = {
	parameters: {
		trellis: {
			responses: {
				"pages.get": () => {
					throw new ORPCError("NOT_FOUND");
				},
			},
		},
	},
};
export const Refused: Story = {
	parameters: {
		trellis: {
			responses: {
				"pages.get": () => {
					throw new ORPCError("FORBIDDEN");
				},
			},
		},
	},
};
export const ContentLoading: Story = { parameters: { trellis: { responses: { "pages.createRenderLease": pending } } } };
export const ContentError: Story = { parameters: { trellis: { responses: { "pages.createRenderLease": failure } } } };
export const CommentsError: Story = { parameters: { trellis: { responses: { "pages.comments": failure } } } };
export const Historical: Story = {
	args: { search: { version: 1 } },
	parameters: {
		trellis: {
			responses: {
				"pages.get": { ...page, requestedVersion: { ...page.requestedVersion, number: 1, label: "First copy" } },
				"pages.createRenderLease": historicalLease,
				"pages.renewRenderLease": historicalLease,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("link", { name: "Back to current" })).toBeVisible();
	},
};
export const Deleted: Story = {
	parameters: {
		trellis: {
			responses: {
				"pages.get": { ...page, deletedAt: timestamp, deletedBy: actor, purgeAt: "2026-10-30T12:00:00.000Z" },
			},
		},
	},
};
export const ArchivedProject: Story = { args: { project: archivedProject } };
export const Offline: Story = { parameters: { trellis: { liveStatus: "down" } } };
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
export const NarrowComments: Story = {
	globals: { viewport: { value: "narrow", isRotated: false } },
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Comments" }));
	},
};

export const VersionsAndRetainedDraft: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(await canvas.findByLabelText("Reply"), "Retain this draft");
		await userEvent.click(await canvas.findByRole("button", { name: "Page actions" }));
		await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Version history" }));
		await expect(await within(document.body).findByRole("heading", { name: "Version history" })).toBeVisible();
		await expect(await within(document.body).findByRole("link", { name: "Open version 2" })).toBeVisible();
		await userEvent.click(await within(document.body).findByRole("button", { name: "Close" }));
		await expect(await canvas.findByDisplayValue("Retain this draft")).toBeVisible();
	},
};

export const CrossVersionComment: Story = {
	render: function Render(args) {
		const rawSearch = useRouterState({ select: (state) => state.location.search as { version?: string | number } });
		const search = { version: rawSearch.version === undefined ? undefined : Number(rawSearch.version) };
		return <PageDetail {...args} search={search} />;
	},
	parameters: {
		trellis: {
			responses: {
				"pages.get": (input: PageGetInput) =>
					input.version === 1
						? { ...page, requestedVersion: { ...page.requestedVersion, number: 1, label: "First copy" } }
						: page,
				"pages.comments": [pageThread, historicalPageThread],
				"pages.createRenderLease": (input: { version: number }) => ({ ...pageLease(), version: input.version }),
				"pages.renewRenderLease": (input: { version: number }) => ({ ...pageLease(), version: input.version }),
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: /Earlier version text/ }));
		await expect(await canvas.findByText("Version 1, read-only")).toBeVisible();
		const anchor = await canvas.findByRole("button", { name: /Earlier version text/ });
		await expect(anchor.closest("[data-active]")).toHaveAttribute("data-active", "true");
		await expect(await canvas.findByRole("button", { name: /Comment 2.*Earlier version text/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	},
};

export const SafeLink: Story = {};

export const CommentMutation: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(await canvas.findByLabelText("Reply"), "Story reply");
		await userEvent.click(await canvas.findByRole("button", { name: "Post reply" }));
		await expect(await canvas.findByText("Reply added")).toBeInTheDocument();
	},
};
