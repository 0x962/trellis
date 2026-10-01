import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageCommentPin } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/PageCommentPin",
	component: PageCommentPin,
	args: { number: 1, label: "Comment 1", x: 50, y: 50, resolved: false, selected: false, onClick: () => {} },
	render: function Render(args) {
		const [selected, setSelected] = useStoryState(args.selected);
		return (
			<div className="relative h-40">
				<PageCommentPin {...args} selected={selected} onClick={() => setSelected(!selected)} />
			</div>
		);
	},
} satisfies Meta<typeof PageCommentPin>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Resolved: Story = { args: { resolved: true } };
export const LargeNumber: Story = { args: { number: 123 } };
export const Selection: Story = {
	play: async ({ canvasElement }) => {
		const pin = await within(canvasElement).findByRole("button", { name: "Comment 1" });
		await expect(pin).toHaveAttribute("aria-pressed", "false");
		await userEvent.click(pin);
		await expect(pin).toHaveAttribute("aria-pressed", "true");
		await userEvent.keyboard(" ");
		await expect(pin).toHaveAttribute("aria-pressed", "false");
	},
};
