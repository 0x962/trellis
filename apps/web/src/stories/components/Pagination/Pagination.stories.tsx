import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pagination } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Pagination",
	component: Pagination,
	args: { label: "Tickets", start: 0, count: 10, total: 50, pending: false, onPage: () => {} },
	render: function Render(args) {
		const [start, setStart] = useStoryState(args.start);
		return <Pagination {...args} start={start} onPage={(direction) => setStart(start + direction * args.count)} />;
	},
} satisfies Meta<typeof Pagination>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const MiddlePage: Story = { args: { start: 20 } };
export const LastPage: Story = { args: { start: 40 } };
export const Pending: Story = { args: { pending: true } };
export const SinglePage: Story = { args: { total: 10 } };
