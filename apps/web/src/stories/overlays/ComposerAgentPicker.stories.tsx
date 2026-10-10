import type { Meta, StoryObj } from "@storybook/react-vite";
import { effortForHarness, HARNESS_DEFAULT_MODELS } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DEFAULT_CHOICE } from "../../features/agents/AssignAgent/assignChoice";
import { ComposerAgentPicker } from "../../features/agents/ComposerAgentPicker";
import { useStoryState } from "../components/useStoryState";
import { accounts, noop } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/ComposerAgentPicker",
	component: ComposerAgentPicker,
	args: {
		value: null,
		accounts,
		disabled: false,
		onPick: noop,
		onEffort: noop,
		onAccount: noop,
		onClear: noop,
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return (
			<ComposerAgentPicker
				{...args}
				value={value}
				onPick={(preset, model) => setValue({ preset, model, effort: null, accountId: null })}
				onEffort={(effort) => setValue({ ...value!, effort })}
				onAccount={(accountId) => setValue({ ...value!, accountId })}
				onClear={args.onClear ? () => setValue(null) : undefined}
			/>
		);
	},
} satisfies Meta<typeof ComposerAgentPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Assign agent") };
export const Selected: Story = { args: { value: DEFAULT_CHOICE }, play: clickButton(/^Agent: Claude/) };
export const Disabled: Story = { args: { value: DEFAULT_CHOICE, disabled: true } };
export const AccountsLoading: Story = { ...Selected, args: { ...Selected.args, accounts: undefined } };
export const EmptyAccounts: Story = { ...Selected, args: { ...Selected.args, accounts: [] } };
export const RequiredAgent: Story = { ...Selected, args: { ...Selected.args, onClear: undefined } };
export const Custom: Story = {
	args: { value: { preset: "custom", model: null, effort: null, accountId: null }, onClear: undefined },
	play: clickButton("Agent: Custom"),
};
export const SearchEmpty: Story = {
	play: async (context) => {
		await clickButton("Assign agent")(context);
		await fillField(context.canvasElement, "Search agents and models", "no-such-model");
	},
};
export const ChangeModel: Story = {
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Assign agent")(context);
		await fillField(context.canvasElement, "Search agents and models", "Codex default");
		await userEvent.click(await body.findByRole("option", { name: "Codex default" }));
		await clickButton(/^Agent: Codex/)(context);
		await fillField(context.canvasElement, "Search agents and models", "Codex default");
		await waitFor(() =>
			expect(body.getByRole("option", { name: "Codex default" })).toHaveAttribute("data-checked", "true"),
		);
	},
};
export const ChangeAccount: Story = {
	args: Selected.args,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton(/^Agent: Claude/)(context);
		await userEvent.click(await body.findByRole("button", { name: "Account" }));
		await userEvent.click(await body.findByRole("option", { name: accounts[1]!.name }));
		await waitFor(() => expect(body.getByRole("button", { name: "Account" })).toHaveTextContent(accounts[1]!.name));
	},
};
export const ChangeEffort: Story = {
	args: Selected.args,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		const effort = effortForHarness("claude", HARNESS_DEFAULT_MODELS.claude)!;
		await clickButton(/^Agent: Claude/)(context);
		await userEvent.click(await body.findByRole("combobox", { name: effort.label }));
		await userEvent.click(await body.findByRole("option", { name: effort.options[0]!.label }));
		await waitFor(() =>
			expect(body.getByRole("combobox", { name: effort.label })).toHaveTextContent(effort.options[0]!.label),
		);
	},
};
export const ClearSelection: Story = {
	args: Selected.args,
	play: async (context) => {
		await clickButton(/^Agent: Claude/)(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("option", { name: "No agent" }));
		await expect(await body.findByRole("button", { name: "Assign agent" })).toBeVisible();
	},
};
