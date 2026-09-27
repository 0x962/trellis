import { expect, mock, test } from "bun:test";
import { scrollSlashMenu } from "./SlashMenuList";

test("scrolls when the menu opens and when its highlight moves", () => {
	const firstScroll = mock(() => {});
	const secondScroll = mock(() => {});
	const options = [{ scrollIntoView: firstScroll }, { scrollIntoView: secondScroll }];
	const children = {
		length: options.length,
		item: (index: number) => options[index] ?? null,
	} as unknown as HTMLCollection;
	const list = { children } as unknown as HTMLDivElement;

	scrollSlashMenu(list, false, children.length, 0);
	expect(firstScroll).not.toHaveBeenCalled();

	scrollSlashMenu(list, true, children.length, 0);
	expect(firstScroll).toHaveBeenCalledWith({ block: "nearest" });

	scrollSlashMenu(list, true, children.length, 1);
	expect(secondScroll).toHaveBeenCalledWith({ block: "nearest" });
});
