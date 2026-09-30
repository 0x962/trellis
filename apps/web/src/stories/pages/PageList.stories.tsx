import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageList } from "../../features/pages/PageList";
import { pageResponses } from "./fixtures/page";
import { archivedProject, failure, pending, project } from "./fixtures/project";

const meta = {
	title: "Pages/Page list",
	component: PageList,
	args: { project, search: {}, onSearchChange: () => {} },
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/pages", responses: pageResponses } },
} satisfies Meta<typeof PageList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = {
	parameters: { trellis: { responses: { "pages.list": { items: [], nextCursor: null } } } },
};
export const FilteredEmpty: Story = { ...Empty, args: { search: { q: "unmatched" } } };
export const Loading: Story = { parameters: { trellis: { responses: { "pages.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "pages.list": failure } } } };
export const Archived: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
