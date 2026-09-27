import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useSlashMenuStore } from "./SlashMenu";
import { SlashMenuList } from "./SlashMenuList";
import { blocks } from "./blocks";

const closeMenu = () =>
	useSlashMenuStore.setState({
		open: false,
		items: [],
		highlighted: 0,
		left: 0,
		top: 0,
		pick: () => {},
	});

const openMenu = (highlighted: number) =>
	useSlashMenuStore.setState({
		open: true,
		items: blocks.slice(0, 2),
		highlighted,
		left: 40,
		top: 80,
		pick: () => {},
	});

const selectedOption = () =>
	renderToStaticMarkup(<SlashMenuList />).match(
		/<button[^>]*aria-selected="true"[^>]*>.*?<\/button>/,
	)?.[0] ?? "";

afterEach(closeMenu);

test("opening the menu selects its first block", () => {
	closeMenu();
	expect(renderToStaticMarkup(<SlashMenuList />)).toBe("");

	openMenu(0);
	expect(selectedOption()).toContain("Text");
});

test("moving the highlight selects the next block", () => {
	openMenu(0);
	expect(selectedOption()).toContain("Text");

	openMenu(1);
	expect(selectedOption()).toContain("Heading 1");
});
