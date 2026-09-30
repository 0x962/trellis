import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageSheet } from "../../features/epics/ResourceList/components/ImageSheet";
import { imageResource } from "./fixtures/resources";

const meta = {
	title: "Pages/Resource image",
	component: ImageSheet,
	args: { name: imageResource.name, url: imageResource.blob!.url, onClose: () => {} },
} satisfies Meta<typeof ImageSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
