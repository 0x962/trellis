import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { LabelEditor } from "../../features/project-settings/LabelEditor";
import { StatusCreateForm } from "../../features/project-settings/StatusCreateForm";
import { StatusEditor } from "../../features/project-settings/StatusRow/components/StatusEditor";
import { MenuLinkEditor } from "../../features/settings/MenuLinks/components/MenuLinkEditor";
import { failure, labels, noop, pending, responses, statuses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/SettingsForms",
	component: LabelEditor,
	args: { project: "DEMO", label: null, groupId: null, onChanged: async () => {}, onCancel: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"labels.create": labels[0],
				"labels.update": labels[0],
				"statuses.create": statuses[0],
				"statuses.update": statuses[0],
			},
		},
	},
} satisfies Meta<typeof LabelEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
const labelSubmit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Name", "Usability");
	await clickButton("Save")(context);
};
export const LabelCreate: Story = {};
export const LabelSelected: Story = { args: { label: labels[0]! } };
export const LabelColors: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Color" }));
	},
};
export const LabelPending: Story = {
	parameters: { trellis: { responses: { "labels.create": pending } } },
	play: labelSubmit,
};
export const LabelError: Story = {
	parameters: { trellis: { responses: { "labels.create": failure } } },
	play: labelSubmit,
};
export const LabelValidation: Story = { play: clickButton("Save") };
export const StatusCreate: Story = {
	render: () => (
		<StatusCreateForm
			project="DEMO"
			busy={false}
			onWrite={async (operation) => operation()}
			onCreated={async () => {}}
			onCancel={noop}
		/>
	),
};
export const StatusCategory: Story = {
	...StatusCreate,
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Category" }));
	},
};
export const StatusValidation: Story = { ...StatusCreate, play: clickButton("Create status") };
export const StatusEdit: Story = {
	render: () => (
		<StatusEditor
			project="DEMO"
			status={statuses[0]!}
			busy={false}
			onWrite={async (operation) => operation()}
			onChanged={async () => {}}
			onCancel={noop}
		/>
	),
};
export const StatusError: Story = {
	...StatusEdit,
	parameters: { trellis: { responses: { "statuses.update": failure } } },
	play: clickButton("Save status"),
};
export const MenuLinkCreate: Story = {
	render: () => <MenuLinkEditor link={null} busy={false} onCancel={noop} onSave={async () => {}} />,
};
export const MenuLinkSelected: Story = {
	render: () => (
		<MenuLinkEditor
			link={{ id: "catalog", label: "Documentation", url: "https://example.test/docs", icon: "BookOpen" }}
			busy={false}
			onCancel={noop}
			onSave={async () => {}}
		/>
	),
};
export const MenuLinkPending: Story = {
	render: () => <MenuLinkEditor link={null} busy onCancel={noop} onSave={async () => {}} />,
};
export const MenuLinkError: Story = { ...MenuLinkCreate, play: clickButton("Save") };
export const MenuLinkIcons: Story = {
	...MenuLinkCreate,
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Icon" }));
	},
};
