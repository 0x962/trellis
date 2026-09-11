import { expect, test } from "bun:test";

test("a status summary keeps the content, ticket count, and action menu on one row", async () => {
	const css = await Bun.file(new URL("./project-settings.css", import.meta.url)).text();
	const rule = css.match(/@utility status-row-summary \{([^}]*)\}/)?.[1];
	expect(rule).toContain("grid-cols-[minmax(0,1fr)_auto_auto]");
});
