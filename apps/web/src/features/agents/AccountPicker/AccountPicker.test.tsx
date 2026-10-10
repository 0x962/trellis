import { afterAll, expect, mock, test } from "bun:test";
import { Field as RealField } from "@trellis/ui";
import { act, type ReactNode } from "react";
import { createRoot } from "test-renderer";

type CommandProps = { label: string; onSearchChange: (search: string) => void; onSelect: (id: string) => void };
let command!: CommandProps;
const Command = Object.assign(
	(props: CommandProps) => {
		command = props;
		return null;
	},
	{ Virtual: () => null },
);
mock.module("@trellis/ui", () => ({
	Command,
	Field: RealField,
	PickerButton: ({ label, children, id }: { label: string; children: ReactNode; id?: string }) => (
		<button type="button" id={id} aria-label={label}>
			{children}
		</button>
	),
	Popover: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
		<>
			{trigger}
			{children}
		</>
	),
	ComposerProperty: () => null,
	ProviderIcon: () => null,
	Select: () => null,
}));
mock.module("../AccountCreateForm", () => ({
	AccountCreateForm: () => (
		<>
			<RealField label="Account name">
				<input />
			</RealField>
			<RealField label="Existing profile directory">
				<input />
			</RealField>
		</>
	),
}));
const { ComposerAgentPicker } = await import("../ComposerAgentPicker");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("account creation fields keep separate labels and IDs inside the composer agent picker", async () => {
	const root = createRoot();
	await act(async () =>
		root.render(
			<ComposerAgentPicker
				value={{ preset: "claude", model: null, effort: null, accountId: null }}
				accounts={[]}
				disabled={false}
				onPick={() => {}}
				onEffort={() => {}}
				onAccount={() => {}}
			/>,
		),
	);
	await act(async () => command.onSearchChange("Work"));
	await act(async () => command.onSelect("create-account:Work"));
	const labels = root.container.queryAll((node) => node.type === "label");
	expect(labels.map((node) => node.children[0])).toEqual(["Account", "Account name", "Existing profile directory"]);
	const controls = root.container.queryAll((node) => node.type === "input" || node.type === "button");
	expect(new Set(controls.map((node) => node.props.id)).size).toBe(3);
	for (const [index, control] of controls.entries()) expect(labels[index]!.props.htmlFor).toBe(control.props.id);
	await act(async () => root.unmount());
});
