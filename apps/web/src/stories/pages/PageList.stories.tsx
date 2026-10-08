import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, within } from "storybook/test";
import { PageList } from "../../features/pages/PageList";
import { page, pageResponses } from "./fixtures/page";
import { archivedProject, failure, id, pending, project } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Page list",
	component: PageList,
	args: { project, search: {}, onSearchChange: () => {} },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <PageList {...args} onSearchChange={(search) => updateArgs({ search })} />;
	},
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/pages", responses: pageResponses } },
} satisfies Meta<typeof PageList>;
export default meta;
type Story = StoryObj<typeof meta>;
const densePages = Array.from({ length: 48 }, (_, index) => ({
	...page,
	id: id(700 + index),
	ref: `DEMO/pages/interface-review-${index + 1}`,
	slug: `interface-review-${index + 1}`,
	title:
		index % 3 === 0
			? `Keyboard controls and focus order for Page journey ${index + 1}, with a complete identifying title`
			: `Interface review ${index + 1}`,
	pinned: index % 4 === 0,
	openThreadCount: index % 5,
}));

export const Populated: Story = {};
export const Dense: Story = {
	parameters: { trellis: { responses: { "pages.list": { items: densePages, nextCursor: null } } } },
};
export const DenseNarrow: Story = {
	...Dense,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "pages.list": { items: [], nextCursor: null } } } },
};
export const FilteredEmpty: Story = { args: { search: { q: "unmatched" } } };
export const SearchAndClear: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const search = await canvas.findByLabelText("Search Pages");
		await userEvent.type(search, "unmatched");
		await expect(await canvas.findByRole("heading", { name: "No Pages match" })).toBeVisible();
		await userEvent.clear(await canvas.findByLabelText("Search Pages"));
		await expect(await canvas.findByText("Interface review", { exact: true })).toBeVisible();
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "pages.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "pages.list": failure } } } };
export const Archived: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
