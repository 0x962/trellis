import { expect, mock, test } from "bun:test";
import type { LabelCreateInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { LabelEditor } from "./LabelEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mount = async (write?: (input: LabelCreateInput) => Promise<void>) => {
	const create = mock(
		write ??
			(async () => {
				await new Promise<void>(() => {});
			}),
	);
	const app = {
		client: {
			labels: {
				create,
			},
		},
	} as unknown as AppContext;
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={app}>
				<LabelEditor project="DEMO" label={null} groupId={null} onChanged={async () => {}} onCancel={() => {}} />
			</AppProvider>,
		);
	});
	const input = () => root.container.queryAll((node) => node.type === "input")[0]!;
	const form = () => root.container.queryAll((node) => node.type === "form")[0]!;
	const submit = () => root.container.queryAll((node) => node.type === "button" && node.props.type === "submit")[0]!;
	return {
		root,
		create,
		input,
		form,
		submit,
		changeName: (value: string) =>
			act(async () => input().props.onChange({ currentTarget: { value }, target: { value } })),
		unmount: () => act(async () => root.unmount()),
	};
};

test("keeps the Name and Color controls aligned when the Name error appears", async () => {
	const fixture = await mount();

	await act(async () => fixture.form().props.onSubmit({ preventDefault() {} }));

	const grid = fixture.root.container.queryAll(
		(node) => node.type === "div" && node.props.className === "status-row-editor-grid items-start",
	)[0]!;
	expect(grid).toBeDefined();
	expect(fixture.input().props["aria-invalid"]).toBe(true);
	const messageId = fixture.input().props["aria-describedby"];
	const message = fixture.root.container.queryAll((node) => node.props.id === messageId)[0]!;
	expect(message.children.join("")).toBe("Enter a label name.");

	await fixture.unmount();
});

test("sends one save request while label creation remains pending", async () => {
	let finish!: () => void;
	const fixture = await mount(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	await fixture.changeName("Accessibility");

	await act(async () => {
		void fixture.form().props.onSubmit({ preventDefault() {} });
		void fixture.form().props.onSubmit({ preventDefault() {} });
		await Promise.resolve();
	});

	expect(fixture.create).toHaveBeenCalledTimes(1);
	expect(fixture.submit().props.disabled).toBe(true);
	expect(fixture.submit().props["aria-busy"]).toBe(true);

	await act(async () => finish());
	await fixture.unmount();
});
