import { expect, mock, test } from "bun:test";
import { scrollHighlightedItemIntoView } from "./SlashMenuList";

test("scrolls when the menu opens and when its highlight moves", () => {
	const firstScroll = mock(() => {});
	const secondScroll = mock(() => {});
	const options = [{ scrollIntoView: firstScroll }, { scrollIntoView: secondScroll }];
	const children = {
		length: options.length,
		item: (index: number) => options[index] ?? null,
	} as unknown as HTMLCollection;
	const list = { children } as unknown as HTMLDivElement;

	scrollHighlightedItemIntoView(list, false, children.length, 0);
	expect(firstScroll).not.toHaveBeenCalled();

	scrollHighlightedItemIntoView(list, true, children.length, 0);
	expect(firstScroll).toHaveBeenCalledWith({ block: "nearest" });

	scrollHighlightedItemIntoView(list, true, children.length, 1);
	expect(secondScroll).toHaveBeenCalledWith({ block: "nearest" });
});
