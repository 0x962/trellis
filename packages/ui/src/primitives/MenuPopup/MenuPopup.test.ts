import { expect, test } from "bun:test";

const source = await Bun.file(new URL("./MenuPopup.tsx", import.meta.url)).text();

test("fits the popup inside a narrow viewport", () => {
	expect(source).toContain("min-w-40");
	expect(source).toContain("max-w-(--available-width)");
	expect(source).toContain("max-sm:min-w-0");
});

test("keeps compact desktop rows and 44 pixel coarse-pointer rows", () => {
	expect(source).toContain('item.detail === undefined ? "h-7 pointer-coarse:h-11"');
	expect(source).toContain(': "min-h-8 py-1.5 pointer-coarse:min-h-11"');
});

test("keeps truncation available when the popup narrows", () => {
	expect(source).toContain('className="flex min-w-0 flex-1 flex-col"');
	expect(source).toContain('className="truncate"');
	expect(source).toContain("<Kbd>{item.kbd}</Kbd>");
});
