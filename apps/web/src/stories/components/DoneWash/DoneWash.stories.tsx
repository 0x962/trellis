import type { Meta, StoryObj } from "@storybook/react-vite";
import { DoneWashSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/DoneWashSection";

const meta = {
	title: "Components/DoneWash",
	component: DoneWashSection,
	parameters: {
		docs: {
			description: {
				component:
					"Use the replay action to show a completed row and wave. Reduced motion follows the browser preference.",
			},
		},
	},
} satisfies Meta<typeof DoneWashSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <DoneWashSection /> };
