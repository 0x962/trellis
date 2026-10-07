import { expect, test } from "bun:test";
import type { Status } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { StatusEditor } from "../StatusRow/components/StatusEditor";
import { StatusCreateForm } from "./StatusCreateForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status: Status = {
	id: "01M4A2W6ZQ0ZV0DQ3AXD3YCET4",
	projectId: "01M4A09JDJW0NHZ36BSC9M71EH",
	slug: "todo",
	name: "Todo",
	description: "",
	category: "todo",
	color: "fg-muted",
	isDefault: true,
	position: 0,
	createdAt: "2026-10-07T00:00:00.000Z",
	updatedAt: "2026-10-07T00:00:00.000Z",
};

const messageFor = (root: ReturnType<typeof createRoot>, input: { props: Record<string, unknown> }) => {
	const id = input.props["aria-describedby"];
	return root.container.queryAll((node) => node.props.id === id)[0];
};

test("the create error belongs to the status name field", async () => {
	const client = {
		statuses: {
			create: async () => {
				throw new Error("A status with this name exists.");
			},
		},
	};
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={{ client } as unknown as AppContext}>
				<StatusCreateForm
					project="TRL"
					busy={false}
					onWrite={async (operation) => operation()}
					onCreated={async () => {}}
					onCancel={() => {}}
				/>
			</AppProvider>,
		);
	});
	const input = root.container.queryAll((node) => node.type === "input")[0]!;
	await act(async () => input.props.onChange({ currentTarget: { value: "Existing" }, target: { value: "Existing" } }));
	const form = root.container.queryAll((node) => node.type === "form")[0]!;
	await act(async () => form.props.onSubmit({ preventDefault() {} }));
	expect(input.props["aria-invalid"]).toBe(true);
	expect(messageFor(root, input)?.children.join("")).toBe("A status with this name exists.");
	await act(async () => root.unmount());
});

test("the edit error belongs to the status name field", async () => {
	const client = {
		statuses: {
			update: async () => {
				throw new Error("A status with this name exists.");
			},
		},
	};
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={{ client } as unknown as AppContext}>
				<StatusEditor
					project="TRL"
					status={status}
					busy={false}
					onWrite={async (operation) => operation()}
					onChanged={async () => {}}
					onCancel={() => {}}
				/>
			</AppProvider>,
		);
	});
	const form = root.container.queryAll((node) => node.type === "form")[0]!;
	await act(async () => form.props.onSubmit({ preventDefault() {} }));
	const input = root.container.queryAll((node) => node.type === "input" && node.props.value === "Todo")[0]!;
	expect(input.props["aria-invalid"]).toBe(true);
	expect(messageFor(root, input)?.children.join("")).toBe("A status with this name exists.");
	await act(async () => root.unmount());
});
