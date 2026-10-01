import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckConfettiSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/CheckConfettiSection";

const meta = {
	title: "Components/CheckConfetti",
	component: CheckConfettiSection,
	parameters: {
		docs: {
			description: {
				component:
					"Use the replay action to show the completion burst. The fixture includes a full check ribbon. Reduced motion follows the browser preference.",
			},
		},
	},
} satisfies Meta<typeof CheckConfettiSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <CheckConfettiSection /> };
