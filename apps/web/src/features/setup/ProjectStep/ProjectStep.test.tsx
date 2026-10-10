import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { ProjectStep, type ProjectStepProps } from "./ProjectStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mount = async (props: Partial<ProjectStepProps> = {}) => {
	const calls: Parameters<ProjectStepProps["onCreate"]>[0][] = [];
	let finish!: () => void;
	const root = createRoot();
	await act(async () => {
		root.render(
			<ProjectStep
				initialName={props.initialName}
				taken={props.taken ?? []}
				takenNames={props.takenNames ?? []}
				takenColors={[]}
				onCreate={
					props.onCreate ??
					(async (input) => {
						calls.push(input);
						await new Promise<void>((resolve) => {
							finish = resolve;
						});
					})
				}
			/>,
		);
	});
	const inputs = () => root.container.queryAll((node) => node.type === "input" && "value" in node.props);
	const changeName = (value: string) =>
		act(async () => inputs()[0]!.props.onChange({ currentTarget: { value }, target: { value } }));
	const changeKey = (value: string) =>
		act(async () => inputs()[1]!.props.onChange({ currentTarget: { value }, target: { value } }));
	const messageFor = (index: number) => {
		const id = inputs()[index]!.props["aria-describedby"];
		return root.container.queryAll((node) => node.props.id === id)[0];
	};
	return { root, calls, finish: () => finish(), inputs, changeName, changeKey, messageFor };
};

test("accepts a ten-character project key and rejects an eleven-character key", async () => {
	const fixture = await mount();
	await fixture.changeName("Project");
	await fixture.changeKey("ABCDEFGHIJ");
	expect(fixture.inputs()[1]!.props["aria-invalid"]).toBeUndefined();
	expect(
		fixture.root.container.queryAll((node) => node.type === "button" && node.props.type === "submit")[0]!.props
			.disabled,
	).toBe(false);

	await fixture.changeKey("ABCDEFGHIJK");
	expect(fixture.inputs()[1]!.props["aria-invalid"]).toBe(true);
	expect(fixture.messageFor(1)?.children.join("")).toBe(
		"A key is 2 to 10 characters: a letter, then letters or digits.",
	);

	await act(async () => fixture.root.unmount());
});

test("associates duplicate name, duplicate key, and key format messages with their fields", async () => {
	const fixture = await mount({ taken: ["TAKEN"], takenNames: ["Existing"] });
	await fixture.changeName("existing");
	expect(fixture.inputs()[0]!.props["aria-describedby"]).toBe(fixture.messageFor(0)?.props.id);
	expect(fixture.messageFor(0)?.children.join("")).toBe("A project named existing exists.");

	await fixture.changeName("New project");
	await fixture.changeKey("TAKEN");
	expect(fixture.inputs()[1]!.props["aria-describedby"]).toBe(fixture.messageFor(1)?.props.id);
	expect(fixture.messageFor(1)?.children.join("")).toBe("Another project uses the key TAKEN.");

	await fixture.changeKey("1BAD");
	expect(fixture.inputs()[1]!.props["aria-describedby"]).toBe(fixture.messageFor(1)?.props.id);
	expect(fixture.messageFor(1)?.children.join("")).toBe(
		"A key is 2 to 10 characters: a letter, then letters or digits.",
	);

	await act(async () => fixture.root.unmount());
});

test("sends one create request while project creation remains pending", async () => {
	const fixture = await mount();
	await fixture.changeName("Project");
	await fixture.changeKey("PROJECT");
	const form = fixture.root.container.queryAll((node) => node.type === "form")[0]!;
	await act(async () => {
		void form.props.onSubmit({ preventDefault() {}, stopPropagation() {} });
		void form.props.onSubmit({ preventDefault() {}, stopPropagation() {} });
		await Promise.resolve();
	});

	expect(fixture.calls).toEqual([{ key: "PROJECT", name: "Project", color: null }]);
	const button = fixture.root.container.queryAll((node) => node.type === "button" && node.props.type === "submit")[0]!;
	expect(button.props.disabled).toBe(true);
	expect(button.props["aria-busy"]).toBe(true);

	await act(async () => fixture.finish());
	await act(async () => fixture.root.unmount());
});

test("retains the typed project name and key after a create refusal", async () => {
	const calls: string[] = [];
	const fixture = await mount({
		initialName: "New project",
		onCreate: async ({ name }) => {
			calls.push(name);
			if (calls.length === 1) throw new Error("The project key is already in use.");
		},
	});
	expect(fixture.inputs()[0]!.props.value).toBe("New project");
	expect(fixture.inputs()[1]!.props.value).not.toBe("");
	const form = fixture.root.container.queryAll((node) => node.type === "form")[0]!;
	const submit = () => form.props.onSubmit({ preventDefault() {}, stopPropagation() {} });
	await act(submit);
	expect(fixture.inputs()[0]!.props.value).toBe("New project");
	expect(fixture.root.container.queryAll((node) => node.props.role === "alert").length).toBeGreaterThan(0);
	await fixture.changeKey("FRESH");
	await act(submit);
	expect(calls).toEqual(["New project", "New project"]);
	await act(async () => fixture.root.unmount());
});
