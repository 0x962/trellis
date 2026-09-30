import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDraftPicker } from "../../features/flows/FlowEditor/components/FlowDraftPicker";
import { DocumentDraftDialog } from "../../features/flows/LangflowEditor/components/DocumentDraftDialog";
import { flowDoc } from "../pages/fixtures/flow";
import { at, noop } from "./fixtures";
import { clickButton } from "./interactions";

const copy = {
	id: "draft-1",
	order: 0,
	importedAt: at,
	entry: { area: "local" as const, key: "storybook-draft", value: JSON.stringify({ version: 1, graph: flowDoc }) },
};
const identity = { host: "storybook", actor: "storybook", flow: flowDoc.flow.id, tab: "review" };
const documentCopy = {
	identity,
	bytes: JSON.stringify({
		version: 1,
		identity,
		baseVersion: 1,
		updatedAt: at,
		contentJson: "{}",
		savedContentJson: "{}",
		legacyBytes: null,
		submission: null,
		blocked: null,
	}),
};
const meta = {
	title: "Overlays/FlowDrafts",
	component: FlowDraftPicker,
	args: { copies: [copy], error: "", onSelect: noop, onClose: noop },
} satisfies Meta<typeof FlowDraftPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ImportedOpen: Story = {};
export const ImportedEmpty: Story = { args: { copies: [] } };
export const ImportedError: Story = { args: { error: "The imported draft needs review." } };
export const BrowserOpen: Story = {
	render: () => (
		<DocumentDraftDialog
			copies={[documentCopy]}
			error=""
			busy={false}
			readOnly={false}
			onClose={noop}
			onRecover={async () => {}}
			onDiscard={async () => {}}
		/>
	),
};
export const BrowserEmpty: Story = {
	render: () => (
		<DocumentDraftDialog
			copies={[]}
			error=""
			busy={false}
			readOnly={false}
			onClose={noop}
			onRecover={async () => {}}
			onDiscard={async () => {}}
		/>
	),
};
export const BrowserPending: Story = {
	render: () => (
		<DocumentDraftDialog
			copies={[documentCopy]}
			error=""
			busy
			readOnly={false}
			onClose={noop}
			onRecover={async () => {}}
			onDiscard={async () => {}}
		/>
	),
};
export const BrowserDisabled: Story = {
	render: () => (
		<DocumentDraftDialog
			copies={[documentCopy]}
			error=""
			busy={false}
			readOnly
			onClose={noop}
			onRecover={async () => {}}
			onDiscard={async () => {}}
		/>
	),
};
export const BrowserError: Story = {
	render: () => (
		<DocumentDraftDialog
			copies={[documentCopy]}
			error="The draft needs a newer document format."
			busy={false}
			readOnly={false}
			onClose={noop}
			onRecover={async () => {}}
			onDiscard={async () => {}}
		/>
	),
};
export const DiscardConfirmation: Story = { ...BrowserOpen, play: clickButton("Discard draft") };
