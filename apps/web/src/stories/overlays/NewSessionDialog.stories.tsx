import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { NewSessionDialog } from "../../features/sessions/NewSessionDialog";
import { NewSessionHost } from "../../features/sessions/NewSessionHost";
import { sessionComposerActions } from "../../features/sessions/sessionComposerStore";
import { failure, noop, pending, responses, run, session } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/NewSessionDialog",
	component: NewSessionDialog,
	args: { onClose: noop },
	beforeEach: (context) => {
		sessionComposerActions.clear();
		if (!context.parameters.closed) sessionComposerActions.open();
	},
	parameters: { trellis: { responses: { ...responses, "sessions.create": { ...session, run } } } },
	render: () => (
		<>
			<Tooltip content="New session">
				<IconButton label="New session" icon={<Plus />} onClick={() => sessionComposerActions.open()} />
			</Tooltip>
			<NewSessionHost />
		</>
	),
} satisfies Meta<typeof NewSessionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Prompt", "Inspect the component catalog.");
	await clickButton("Start session")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = {
	beforeEach: () => {
		sessionComposerActions.clear();
		sessionComposerActions.open("DEMO");
		sessionComposerActions.change({ project: "DEMO", name: "Catalog review", prompt: "Review every control." });
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "projects.list": [], "harnessAccounts.list": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "projects.list": pending, "harnessAccounts.list": pending } } },
};
export const Pending: Story = { parameters: { trellis: { responses: { "sessions.create": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "sessions.create": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
