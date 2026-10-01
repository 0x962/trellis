import type { Meta, StoryObj } from "@storybook/react-vite";
import { TicketGlimmerSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/TicketGlimmerSection";

const meta = {
	title: "Components/TicketGlimmer",
	component: TicketGlimmerSection,
	parameters: {
		docs: {
			description: {
				component:
					"Use the switch to start or stop the working treatment. The fixture uses the canonical ticket card. Reduced motion follows the browser preference.",
			},
		},
	},
} satisfies Meta<typeof TicketGlimmerSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <TicketGlimmerSection /> };
