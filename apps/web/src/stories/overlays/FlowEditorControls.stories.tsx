import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FlowSettingsSheet } from "../../features/flows/FlowEditor/components/FlowSettingsSheet";
import { NodeInspector } from "../../features/flows/FlowEditor/components/NodeInspector";
import { FlowProjectSelect } from "../../features/flows/FlowProjectSelect";
import { NewFlowDialog } from "../../features/flows/FlowsPage/components/NewFlowDialog";
import { flowDoc, flowResponses } from "../pages/fixtures/flow";
import { failure, noop, pending } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const fields = flowDoc.nodes[0]!;
const meta = {
	title: "Overlays/FlowEditorControls",
	component: NewFlowDialog,
	args: { onClose: noop, onCreated: noop },
	parameters: {
		trellis: {
			responses: {
				...flowResponses,
				"flows.create": flowDoc.flow,
				"flows.update": flowDoc.flow,
				"flows.delete": { id: flowDoc.flow.id },
			},
		},
	},
} satisfies Meta<typeof NewFlowDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Name", "Catalog review");
	await clickButton("Create flow")(context);
};
export const NewFlow: Story = {};
export const NewFlowLoading: Story = { parameters: { trellis: { responses: { "projects.list": pending } } } };
export const NewFlowError: Story = {
	parameters: { trellis: { responses: { "flows.create": failure } } },
	play: submit,
};
export const NewFlowPending: Story = {
	parameters: { trellis: { responses: { "flows.create": pending } } },
	play: submit,
};
export const Settings: Story = {
	render: () => <FlowSettingsSheet flow={flowDoc.flow} onSaved={noop} onClose={noop} />,
};
export const SettingsLoading: Story = {
	...Settings,
	parameters: { trellis: { responses: { "flowDocumentsV1.get": pending } } },
};
export const SettingsError: Story = {
	...Settings,
	parameters: { trellis: { responses: { "flows.update": failure } } },
	play: async (context) => {
		await fillField(context.canvasElement, "Name", "Revised flow");
		await clickButton("Save changes")(context);
	},
};
export const SettingsPending: Story = {
	...SettingsError,
	parameters: { trellis: { responses: { "flows.update": pending } } },
};
export const DeleteConfirmation: Story = { ...Settings, play: clickButton("Delete flow") };
export const ProjectSelected: Story = {
	render: function Render() {
		const [project, setProject] = useState("DEMO");
		return <FlowProjectSelect value={project} onChange={setProject} />;
	},
};
export const ProjectDisabled: Story = { render: () => <FlowProjectSelect value="DEMO" onChange={noop} disabled /> };
export const ProjectError: Story = {
	...ProjectSelected,
	parameters: { trellis: { responses: { "projects.list": failure } } },
};
export const ChangeProject: Story = {
	...ProjectSelected,
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const project = await body.findByRole("combobox", { name: "Project" });
		await waitFor(() => expect(project).toBeEnabled());
		await userEvent.click(project);
		await userEvent.click(await body.findByRole("option", { name: "Every project" }));
		await waitFor(() => expect(project).toHaveTextContent("Every project"));
	},
};
export const NodeAgent: Story = {
	render: () => (
		<NodeInspector
			fields={fields}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave
		/>
	),
};
export const NodeGate: Story = {
	render: () => (
		<NodeInspector
			fields={flowDoc.nodes[1]!}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave
		/>
	),
};
export const NodeHuman: Story = {
	render: () => (
		<NodeInspector
			fields={flowDoc.nodes[2]!}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave
		/>
	),
};
export const NodeGroup: Story = {
	render: () => (
		<NodeInspector
			fields={{ ...fields, kind: "group", parallel: true, minutes: 10 }}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave
		/>
	),
};
export const NodeLoop: Story = {
	render: () => (
		<NodeInspector
			fields={{ ...fields, kind: "loop", maxRounds: 3 }}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave
		/>
	),
};
export const NodePending: Story = {
	render: () => (
		<NodeInspector
			fields={fields}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving
			canSave
		/>
	),
};
export const NodeError: Story = {
	render: () => (
		<NodeInspector
			fields={{ ...fields, title: "" }}
			issue="Enter a step title."
			validate={() => ({ canSave: false, issue: "Enter a step title." })}
			onDelete={noop}
			onClose={noop}
			onSave={noop}
			saving={false}
			canSave={false}
		/>
	),
};
