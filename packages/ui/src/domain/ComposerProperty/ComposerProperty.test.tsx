import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { ComposerProperty } from "./ComposerProperty";

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	root = createRoot();
});
afterEach(async () => {
	await act(async () => root.unmount());
});

async function render(value: string, automatic = false) {
	await act(async () => {
		root.render(
			<ComposerProperty glimmer={automatic} glimmerValue={value}>
				{value}
			</ComposerProperty>,
		);
	});
}
const label = () => root.container.queryAll((node) => node.type === "span")[0]!;
const glimmers = () => label().props.className.includes("text-film");

test("a retained automatic value stays still when the dialog opens", async () => {
	await render("High", true);
	expect(glimmers()).toBe(false);
});

test("an automatic change glimmers once and settles without a repeat", async () => {
	await render("Priority");
	await render("High", true);
	expect(glimmers()).toBe(true);
	expect(label().props.className).toContain("[animation-iteration-count:1]");
	await act(async () => label().props.onAnimationEnd());
	expect(glimmers()).toBe(false);
	await render("High", true);
	expect(glimmers()).toBe(false);
});

test("an unchanged automatic result stays still", async () => {
	await render("Priority");
	await render("Priority", true);
	expect(glimmers()).toBe(false);
});

test("a manual choice stays still and ends an automatic glimmer", async () => {
	await render("Priority");
	await render("High", true);
	await render("Low");
	expect(glimmers()).toBe(false);
	await render("Urgent");
	expect(glimmers()).toBe(false);
});

test("a second automatic change starts a new sweep and preserves the button", async () => {
	await render("Choose a wave");
	const button = root.container.queryAll((node) => node.type === "button")[0];
	await render("First", true);
	const first = label();
	await render("Second", true);
	expect(glimmers()).toBe(true);
	expect(label()).not.toBe(first);
	expect(root.container.queryAll((node) => node.type === "button")[0]).toBe(button);
});
