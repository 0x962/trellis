import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StatusChoice } from "../../features/board/components/StatusChoice";
import { LabelGroupRow } from "../../features/project-settings/LabelGroupRow";
import { LabelRow } from "../../features/project-settings/LabelRow";
import { StatusRow } from "../../features/project-settings/StatusRow";
import { at, failure, id, labels, noop, project, responses, statuses } from "./fixtures";
import { clickButton } from "./interactions";

const group = { id: id(80), projectId: project.id, name: "Type", createdAt: at, updatedAt: at };
const meta = {
	title: "Overlays/SettingsMenus",
	component: LabelRow,
	args: {
		project: "DEMO",
		label: labels[0]!,
		groups: [group],
		expanded: false,
		onChanged: async () => {},
		onEdit: noop,
		onCancel: noop,
		onDelete: noop,
	},
	parameters: { trellis: { responses: { ...responses, "labels.update": labels[0], "statuses.update": statuses[0] } } },
	decorators: [
		(Story) => (
			<ul className="status-group">
				<Story />
			</ul>
		),
	],
} satisfies Meta<typeof LabelRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LabelClosed: Story = {};
export const LabelOpen: Story = { play: clickButton("Actions for Design") };
export const LabelGrouped: Story = {
	args: { label: { ...labels[0]!, groupId: group.id }, nested: true },
	play: clickButton("Actions for Design"),
};
export const LabelExpanded: Story = { args: { expanded: true } };
export const LabelMoveError: Story = {
	parameters: { trellis: { responses: { "labels.update": failure } } },
	play: async (context) => {
		await clickButton("Actions for Design")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await page.findByRole("menuitem", { name: "Move to group" }));
		await userEvent.click(await page.findByRole("option", { name: "Type" }));
		await expect(await page.findByRole("alert")).toHaveTextContent("The local fixture refuses this request.");
	},
};
export const GroupClosed: Story = {
	render: () => (
		<LabelGroupRow
			group={group}
			labelCount={3}
			expanded={false}
			renaming={false}
			menuRef={createRef()}
			onToggle={noop}
			onRenamingChange={noop}
			onRename={async () => {}}
			onNewLabel={noop}
			onDelete={noop}
		>
			{null}
		</LabelGroupRow>
	),
};
export const GroupOpen: Story = { ...GroupClosed, play: clickButton("Actions for Type") };
export const GroupRename: Story = {
	render: () => (
		<LabelGroupRow
			group={group}
			labelCount={3}
			expanded
			renaming
			menuRef={createRef()}
			onToggle={noop}
			onRenamingChange={noop}
			onRename={async () => {}}
			onNewLabel={noop}
			onDelete={noop}
		>
			{null}
		</LabelGroupRow>
	),
};
export const StatusClosed: Story = {
	render: () => (
		<StatusRow
			project="DEMO"
			status={statuses[0]!}
			index={0}
			count={1}
			ticketCount={4}
			expanded={false}
			busy={false}
			lastStatus={false}
			onWrite={async (operation) => operation()}
			onChanged={async () => {}}
			onEdit={noop}
			onCancel={noop}
			onMove={noop}
			onDelete={noop}
		/>
	),
};
export const StatusOpen: Story = { ...StatusClosed, play: clickButton("Actions for Todo") };
export const LastStatusOpen: Story = {
	render: () => (
		<StatusRow
			project="DEMO"
			status={statuses[0]!}
			index={0}
			count={1}
			ticketCount={4}
			expanded={false}
			busy={false}
			lastStatus
			onWrite={async (operation) => operation()}
			onChanged={async () => {}}
			onEdit={noop}
			onCancel={noop}
			onMove={noop}
			onDelete={noop}
		/>
	),
	play: async (context) => {
		await clickButton("Actions for Todo")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		const deleteItem = await body.findByRole("menuitem", { name: /Delete/ });
		await expect(deleteItem).toHaveAttribute("aria-disabled", "true");
		await expect(deleteItem).toHaveTextContent("A project keeps at least one status.");
	},
};
export const BoardStatusOpen: Story = {
	decorators: [],
	render: () => <StatusChoice statuses={statuses} onChoose={noop} onCancel={noop} />,
};
export const BoardStatusEmpty: Story = {
	decorators: [],
	render: () => <StatusChoice statuses={[]} onChoose={noop} onCancel={noop} />,
};
