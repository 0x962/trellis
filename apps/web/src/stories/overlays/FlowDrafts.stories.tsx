import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDraftPicker } from "../../features/flows/FlowEditor/components/FlowDraftPicker";
import { flowDoc } from "../pages/fixtures/flow";
import { at, noop } from "./fixtures";

const copy = {
	id: "draft-1",
	order: 0,
	importedAt: at,
	entry: { area: "local" as const, key: "storybook-draft", value: JSON.stringify({ version: 1, graph: flowDoc }) },
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
