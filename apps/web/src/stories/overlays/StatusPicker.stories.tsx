import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StatusPicker } from "../../features/pickers/StatusPicker";
import { useStoryState } from "../components/useStoryState";
import { failure, noop, pending, statuses } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/StatusPicker",
	component: StatusPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		return (
			<StatusPicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				onPick={(picked) => setValue(picked.id)}
			/>
		);
	},
	parameters: { trellis: { responses: { "statuses.list": { statuses } } } },
	args: { statuses, onPick: noop, trigger: <PickerButton label="Status">Status</PickerButton> },
} satisfies Meta<typeof StatusPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Status" disabled>
				Status
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: statuses[1]!.id } };
export const Empty: Story = { args: { open: true, statuses: [] } };

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Status", "In progress"),
};

export const CreateStatus: Story = {
	args: { project: "DEMO" },
	parameters: {
		trellis: {
			responses: {
				"statuses.create": { ...statuses[0]!, id: "01M00000000000000000000999", name: "Release", slug: "release" },
			},
		},
	},
	render: function Render(args) {
		const [name, setName] = useState("Status");
		return (
			<StatusPicker
				{...args}
				trigger={<PickerButton label="Status">{name}</PickerButton>}
				onPick={(picked) => setName(picked.name)}
			/>
		);
	},
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(page.getByRole("button", { name: "Status" }));
		await userEvent.type(await page.findByRole("combobox", { name: "Search statuses" }), "Release");
		await userEvent.click(await page.findByRole("option", { name: 'Create status "Release"' }));
		const form = within(await page.findByRole("dialog", { name: "Create status" }));
		await expect(form.getByRole("textbox", { name: "Status name" })).toHaveValue("Release");
		await userEvent.click(form.getByRole("button", { name: "Create status" }));
		await expect(await page.findByRole("button", { name: "Status" })).toHaveTextContent("Release");
	},
};

export const CreatePending: Story = {
	args: { open: true, project: "DEMO" },
	parameters: { trellis: { responses: { "statuses.list": pending } } },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.type(await page.findByRole("combobox", { name: "Search statuses" }), "Release");
		await expect(page.queryByRole("option", { name: 'Create status "Release"' })).not.toBeInTheDocument();
	},
};
export const CreateListError: Story = {
	...CreatePending,
	parameters: { trellis: { responses: { "statuses.list": failure } } },
};
export const ExcludedNameExists: Story = {
	args: { open: true, project: "DEMO", statuses: [] },
	parameters: { trellis: { responses: { "statuses.list": { statuses: [{ ...statuses[0]!, name: "Release" }] } } } },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		const search = await page.findByRole("combobox", { name: "Search statuses" });
		await userEvent.type(search, "Other");
		await expect(await page.findByRole("option", { name: 'Create status "Other"' })).toBeVisible();
		await userEvent.clear(search);
		await userEvent.type(search, "rElEaSe");
		await expect(page.queryByRole("option", { name: /Create status/ })).not.toBeInTheDocument();
	},
};
