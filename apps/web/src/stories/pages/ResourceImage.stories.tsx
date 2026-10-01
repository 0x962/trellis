import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ImageSheet } from "../../features/epics/ResourceList/components/ImageSheet";
import { imageResource } from "./fixtures/resources";

const meta = {
	title: "Pages/Resource image",
	component: ImageSheet,
	args: { name: imageResource.name, url: imageResource.blob!.url, onClose: () => {} },
	render: function Render(args) {
		const [open, setOpen] = useState(true);
		return <>{open && <ImageSheet {...args} onClose={() => setOpen(false)} />}</>;
	},
} satisfies Meta<typeof ImageSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Closed: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Close" }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
