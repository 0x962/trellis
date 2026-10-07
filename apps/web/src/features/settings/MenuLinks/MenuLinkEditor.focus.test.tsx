import { afterEach, expect, test } from "bun:test";
import type { MenuLink } from "@trellis/api";
import { act, type ReactElement } from "react";
import { createRoot, type TestInstance } from "test-renderer";
import { MenuLinkEditor } from "./components/MenuLinkEditor";
import { parseMenuLink } from "./components/MenuLinkEditor/menuLinkValidation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dispose = async () => {};
afterEach(async () => dispose());

const text = (node: TestInstance): string =>
	node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");

async function mount(node: ReactElement) {
	const root = createRoot();
	dispose = async () => {
		await act(async () => root.unmount());
	};
	await act(async () => root.render(node));
	return root;
}

const field = (root: ReturnType<typeof createRoot>, label: string) => {
	const labelNode = root.container.queryAll((node) => node.type === "label" && text(node) === label)[0]!;
	return root.container.queryAll((node) => node.type === "input" && node.props.id === labelNode.props.htmlFor)[0]!;
};

const button = (root: ReturnType<typeof createRoot>, label: string) =>
	root.container.queryAll(
		(node) => node.type === "button" && (text(node) === label || node.props["aria-label"] === label),
	)[0]!;

test("schema errors belong to their fields and select the first invalid field", async () => {
	const invalid = {
		id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
		label: "",
		icon: "Link",
		url: "http://example.com",
	} as const;
	const parsed = parseMenuLink(invalid);
	expect(parsed.success).toBe(false);
	if (parsed.success) throw new Error("The invalid menu link passed validation.");
	expect(parsed.firstInvalid).toBe("label");
	const root = await mount(
		<MenuLinkEditor
			link={invalid as MenuLink}
			busy={false}
			saveError={null}
			onCancel={() => {}}
			onSave={async () => {}}
		/>,
	);
	const form = root.container.queryAll((node) => node.type === "form")[0]!;
	await act(async () => form.props.onSubmit({ preventDefault() {} }));
	for (const input of [field(root, "Label"), field(root, "HTTPS URL")]) {
		expect(input.props["aria-invalid"]).toBe(true);
		const relation = input.props["aria-describedby"] as string;
		const error = root.container.queryAll((node) => node.props.id === relation)[0]!;
		expect(error.props.role).toBe("alert");
		expect(text(error)).not.toBe("");
	}
});

test("an invalid URL is the first invalid field when the label is valid", () => {
	const parsed = parseMenuLink({
		id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
		label: "Actions",
		icon: "GithubLogo",
		url: "http://example.com",
	});
	expect(parsed.success).toBe(false);
	if (parsed.success) throw new Error("The invalid menu link passed validation.");
	expect(parsed.firstInvalid).toBe("url");
	expect(parsed.errors.label).toBeUndefined();
	expect(parsed.errors.url).toBeDefined();
});

test("a settings write locks the editor actions", async () => {
	const link = {
		id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
		label: "Actions",
		icon: "GithubLogo",
		url: "https://github.com/0x962/trellis/actions",
	} as MenuLink;
	const root = await mount(
		<MenuLinkEditor link={link} busy saveError={null} onCancel={() => {}} onSave={async () => {}} />,
	);
	expect(button(root, "Save").props.disabled).toBe(true);
	expect(button(root, "Save").props["aria-busy"]).toBe(true);
	expect(button(root, "Cancel").props.disabled).toBe(true);
	expect(text(root.container)).toContain("Save in progress");
});
