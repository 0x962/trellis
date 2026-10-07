import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { PageDetail } from "../../features/pages/PageDetail";
import { page, pageLease, pageResponses } from "./fixtures/page";
import { actor, archivedProject, failure, pending, project, timestamp } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Page detail",
	component: PageDetail,
	args: { project, slug: page.slug, search: {} },
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/pages/interface-review", responses: pageResponses } },
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
		await userEvent.click(await within(document.body).findByRole("button", { name: "Close" }));
		await expect(await canvas.findByDisplayValue("Retain this draft")).toBeVisible();
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
