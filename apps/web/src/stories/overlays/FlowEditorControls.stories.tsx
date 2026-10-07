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
export const NewFlowValidation: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("textbox", { name: "Name" }));
		await userEvent.tab();
		await expect(await body.findByText("Enter a flow name.")).toBeVisible();
	},
};
export const NewFlowLoading: Story = {
	parameters: { trellis: { responses: { "projects.list": pending } } },
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await expect(await body.findByText("Loading projects...")).toBeVisible();
		await expect(body.getByRole("combobox", { name: "Project" })).toBeDisabled();
		await expect(body.getByRole("button", { name: "Create flow" })).toBeDisabled();
	},
};
export const NewFlowError: Story = {
	parameters: { trellis: { responses: { "flows.create": failure } } },
	play: async (context) => {
		await submit(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByRole("alert")).toHaveTextContent("Could not create the flow.");
	},
};
export const NewFlowPending: Story = {
	parameters: { trellis: { responses: { "flows.create": pending } } },
	play: async (context) => {
		await submit(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.getByRole("button", { name: "Create flow" })).toHaveAttribute("aria-busy", "true"));
		await expect(body.getByRole("textbox", { name: "Name" })).toBeDisabled();
	},
};
export const NewFlowSuccess: Story = {
	parameters: {
		trellis: {
			responses: {
				"flows.create": (input: { name: string }) => ({ ...flowDoc.flow, name: input.name }),
			},
		},
	},
	render: function Render() {
		const [created, setCreated] = useState<string | null>(null);
		return created === null ? (
			<NewFlowDialog onClose={noop} onCreated={(flow) => setCreated(flow.name)} />
		) : (
			<p role="status">Created {created}.</p>
		);
	},
	play: async (context) => {
		await submit(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByText("Created Catalog review.")).toBeVisible();
	},
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
export const ProjectMenuOpen: Story = {
	...ProjectSelected,
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const project = await body.findByRole("combobox", { name: "Project" });
		await waitFor(() => expect(project).toBeEnabled());
		await userEvent.click(project);
		const everyProject = await body.findByRole("option", { name: "Every project" });
		const demo = await body.findByRole("option", { name: "DEMO" });
		await waitFor(() => expect(everyProject).toBeVisible());
		await expect(demo).toBeVisible();
	},
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
export const NodeDeleteConfirmation: Story = {
	...NodeAgent,
	play: async (context) => {
		await clickButton("Delete step")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		const dialog = await body.findByRole("dialog", { name: /Delete/ });
		await waitFor(() => expect(dialog).toBeVisible());
		await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
	},
};
export const NodeDeleteCancelFocus: Story = {
	...NodeAgent,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		const opener = await body.findByRole("button", { name: "Delete step" });
		await userEvent.click(opener);
		const dialog = await body.findByRole("dialog", { name: /Delete/ });
		await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(opener).toHaveFocus());
	},
};
export const NodeDeleteSuccess: Story = {
	render: function Render() {
		const [deleted, setDeleted] = useState(false);
		return (
			<>
				<section aria-label="Flow canvas" tabIndex={-1}>
					{deleted && <p role="status">Step deleted.</p>}
				</section>
				{!deleted && (
					<NodeInspector
						fields={fields}
						issue={undefined}
						validate={() => ({ canSave: true, issue: undefined })}
						onDelete={() => setDeleted(true)}
						onClose={noop}
						onSave={noop}
						saving={false}
						canSave
					/>
				)}
			</>
		);
	},
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Delete step" }));
		const dialog = await body.findByRole("dialog", { name: /Delete/ });
		await userEvent.click(within(dialog).getByRole("button", { name: "Delete step" }));
		await expect(await body.findByText("Step deleted.", { exact: true })).toBeVisible();
		await waitFor(() => expect(body.getByRole("region", { name: "Flow canvas" })).toHaveFocus());
	},
};
