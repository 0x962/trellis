import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FlowProjectSelect } from "../../features/flows/FlowProjectSelect";
import { noop, projects } from "./fixtures";

const meta = {
	title: "Overlays/FlowProjectSelect",
	component: FlowProjectSelect,
	args: { value: "DEMO", onChange: noop },
	parameters: { trellis: { responses: { "projects.list": projects } } },
	render: function Render(args) {
		const [value, setValue] = useState(args.value);
		return <FlowProjectSelect {...args} value={value} onChange={setValue} />;
	},
} satisfies Meta<typeof FlowProjectSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CreateProjectFields: Story = {
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		const project = await page.findByRole("button", { name: "Project" });
		await waitFor(() => expect(project).toBeEnabled());
		await userEvent.click(project);
		await userEvent.type(await page.findByRole("combobox", { name: "Search projects" }), "Research workspace");
		await userEvent.click(await page.findByRole("option", { name: 'Create project "Research workspace"' }));
		const dialog = within(await page.findByRole("dialog", { name: "Create project" }));
		const name = await dialog.findByRole("textbox", { name: "Project name" });
		const key = dialog.getByRole("textbox", { name: "Key" });
		await expect(name).toHaveValue("Research workspace");
		await expect(name.id).not.toBe(project.id);
		await expect(key.id).not.toBe(project.id);
		await expect(key.id).not.toBe(name.id);
		await userEvent.clear(name);
		await userEvent.type(name, "Research revised");
		await expect(name).toHaveValue("Research revised");
		await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(page.queryByRole("dialog", { name: "Create project" })).not.toBeInTheDocument());
	},
};
