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

const longName = "Interface acceptance evidence with a long descriptive filename for the final review.png";

const previewIsUsable: NonNullable<Story["play"]> = async ({ args, canvasElement }) => {
	const body = within(canvasElement.ownerDocument.body);
	const dialog = await body.findByRole("dialog", { name: args.name });
	const image = within(dialog).getByAltText(args.name);
	expect(image.parentElement).toHaveAttribute("data-image-stage");
	await waitFor(() => expect(image).not.toHaveClass("invisible"));
	expect(image.parentElement).not.toHaveAttribute("aria-busy");
	expect(image).toHaveClass("rounded-lg", "border", "border-border", "bg-surface", "object-contain", "shadow-sm");
	await waitFor(() => expect(body.getByRole("button", { name: "Close" })).toHaveFocus());
};

const previewFailsClearly: NonNullable<Story["play"]> = async ({ args, canvasElement }) => {
	const body = within(canvasElement.ownerDocument.body);
	const dialog = await body.findByRole("dialog", { name: args.name });
	const alert = await within(dialog).findByRole("alert");
	expect(alert).toHaveTextContent("The image did not load");
	expect(within(dialog).getByAltText(args.name)).toHaveClass("invisible");
	expect(dialog.querySelector("[aria-busy='true']")).not.toBeInTheDocument();
	await waitFor(() => expect(body.getByRole("button", { name: "Close" })).toHaveFocus());
};

export const Open: Story = { globals: { theme: "dark" }, play: previewIsUsable };
export const OpenLight: Story = { globals: { theme: "light" }, play: previewIsUsable };
export const LoadError: Story = {
	args: { url: "data:image/png;base64,broken" },
	globals: { theme: "dark" },
	play: previewFailsClearly,
};
export const LoadErrorLight: Story = {
	args: { url: "data:image/png;base64,broken" },
	globals: { theme: "light" },
	play: previewFailsClearly,
};
export const Closed: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Close" }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
export const Narrow: Story = {
	globals: { theme: "dark", viewport: { value: "narrow", isRotated: false } },
	play: previewIsUsable,
};
export const NarrowLight: Story = {
	globals: { theme: "light", viewport: { value: "narrow", isRotated: false } },
	play: previewIsUsable,
};
export const LongName: Story = {
	args: { name: longName },
	globals: { theme: "dark", viewport: { value: "narrow", isRotated: false } },
	play: previewIsUsable,
};
export const LongNameLight: Story = {
	args: { name: longName },
	globals: { theme: "light", viewport: { value: "narrow", isRotated: false } },
	play: previewIsUsable,
};
