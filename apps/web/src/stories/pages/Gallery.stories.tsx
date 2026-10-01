import type { Meta, StoryObj } from "@storybook/react-vite";
import { Gallery } from "@trellis/ui/gallery";

const meta = { title: "Pages/Design gallery", component: Gallery, parameters: { layout: "fullscreen" } } satisfies Meta<
	typeof Gallery
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BothThemes: Story = {};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
