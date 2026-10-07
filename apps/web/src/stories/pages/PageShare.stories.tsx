import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { expect, within } from "storybook/test";
import { PageShare } from "../../features/pages/PageDetail/components/PageShare/PageShare";
import { page } from "./fixtures/page";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Page share",
	component: PageShare,
	args: { page, onClose: () => {}, finalFocus: createRef<HTMLButtonElement>() },
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageShare>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AccessExplanation: Story = {
	play: async () => {
		await expect(await within(document.body).findByRole("heading", { name: "Share Page" })).toBeVisible();
		await expect(document.body).toHaveTextContent("People can open this link only if they can access this project.");
	},
};
