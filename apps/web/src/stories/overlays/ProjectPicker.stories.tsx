import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { ProjectPicker } from "../../features/pickers/ProjectPicker";
import { noop, projects } from "./fixtures";

const meta = {
	title: "Overlays/ProjectPicker",
	component: ProjectPicker,
	args: { projects, onPick: noop, trigger: <PickerButton label="Project">Project</PickerButton> },
} satisfies Meta<typeof ProjectPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Project" disabled>
				Project
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "DEMO" } };
export const Empty: Story = { args: { open: true, projects: [] } };
export const RequestError: Story = { args: { open: true, error: "The project is archived." } };
