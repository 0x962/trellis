import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { ProjectPicker } from "../../features/pickers/ProjectPicker";
import { useStoryState } from "../components/useStoryState";
import { at, failure, noop, pending, projects } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/ProjectPicker",
	component: ProjectPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		return (
			<ProjectPicker {...args} open={open} value={value} onOpenChange={setOpen} onPick={(picked) => setValue(picked)} />
		);
	},
	parameters: { trellis: { responses: { "projects.list": projects } } },
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
export const Empty: Story = {
	args: { open: true, projects: [] },
	parameters: { trellis: { responses: { "projects.list": [] } } },
};
export const RequestError: Story = { args: { open: true, error: "The project is archived." } };

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Project", "LAB"),
};

export const CreatePending: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "projects.list": pending } } },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.type(await page.findByRole("combobox", { name: "Search projects" }), "Research");
		await expect(page.queryByRole("option", { name: 'Create project "Research"' })).not.toBeInTheDocument();
	},
};
export const CreateListError: Story = {
	...CreatePending,
	parameters: { trellis: { responses: { "projects.list": failure } } },
};
export const ArchivedNameExists: Story = {
	args: { open: true, projects: [] },
	parameters: { trellis: { responses: { "projects.list": [{ ...projects[0]!, name: "Research", archivedAt: at }] } } },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		const search = await page.findByRole("combobox", { name: "Search projects" });
		await userEvent.type(search, "Other");
		await expect(await page.findByRole("option", { name: 'Create project "Other"' })).toBeVisible();
		await userEvent.clear(search);
		await userEvent.type(search, "rEsEaRcH");
		await expect(page.queryByRole("option", { name: /Create project/ })).not.toBeInTheDocument();
	},
};
