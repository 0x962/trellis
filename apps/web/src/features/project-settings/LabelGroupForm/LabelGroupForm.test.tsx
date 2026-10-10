import { expect, test } from "bun:test";
import type { LabelGroup } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { LabelGroupForm } from "./LabelGroupForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group: LabelGroup = {
	id: "01M4A2W6ZQ0ZV0DQ3AXD3YCET4",
	projectId: "01M4A09JDJW0NHZ36BSC9M71EH",
	name: "Platform",
	createdAt: "2026-10-07T00:00:00.000Z",
	updatedAt: "2026-10-07T00:00:00.000Z",
};

test("creates the typed group once and returns the saved record after refresh", async () => {
	const calls: unknown[] = [];
	const order: string[] = [];
	const pending: boolean[] = [];
	let picked: LabelGroup | undefined;
	let finish!: (value: LabelGroup) => void;
	const client = {
		labelGroups: {
			create: (input: unknown) => {
				calls.push(input);
				return new Promise<LabelGroup>((resolve) => {
					finish = resolve;
				});
			},
		},
	};
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={{ client } as unknown as AppContext}>
				<LabelGroupForm
					project="TRL"
					initialName="Platform"
					onChanged={async () => {
						order.push("refresh");
					}}
					onCreated={(created) => {
						picked = created;
						order.push("select");
					}}
					onPendingChange={(value) => pending.push(value)}
					onCancel={() => order.push("cancel")}
				/>
			</AppProvider>,
		);
	});
	const input = root.container.queryAll((node) => node.type === "input")[0]!;
	expect(input.props.value).toBe("Platform");
	const form = root.container.queryAll((node) => node.type === "form")[0]!;
	let stopped = 0;
	const event = {
		preventDefault() {},
		stopPropagation() {
			stopped++;
		},
	};
	await act(async () => {
		form.props.onSubmit(event);
		form.props.onSubmit(event);
	});
	expect(calls).toEqual([{ project: "TRL", name: "Platform" }]);
	expect(input.props.disabled).toBe(true);
	expect(stopped).toBe(2);
	await act(async () => finish(group));
	expect(picked).toBe(group);
	expect(order).toEqual(["refresh", "select"]);
	expect(pending).toEqual([true, false]);
	await act(async () => root.unmount());
});

test("keeps the typed name after a rejected create and permits correction", async () => {
	const client = {
		labelGroups: {
			create: async () => {
				throw new Error("A group with this name exists.");
			},
		},
	};
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={{ client } as unknown as AppContext}>
				<LabelGroupForm project="TRL" initialName="Platform" onChanged={async () => {}} onCancel={() => {}} />
			</AppProvider>,
		);
	});
	const form = root.container.queryAll((node) => node.type === "form")[0]!;
	await act(async () => form.props.onSubmit({ preventDefault() {}, stopPropagation() {} }));
	const input = root.container.queryAll((node) => node.type === "input")[0]!;
	expect(input.props.value).toBe("Platform");
	expect(input.props.disabled).toBe(false);
	expect(input.props["aria-invalid"]).toBe(true);
	const error = root.container.queryAll((node) => node.props.id === input.props["aria-describedby"])[0]!;
	expect(error.children.join("")).toBe("A group with this name exists.");
	await act(async () => root.unmount());
});
