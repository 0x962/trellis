import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OutcomeBlock } from "./OutcomeBlock";

test("prints the outcome sentence of a merged ticket", () => {
	const html = renderToStaticMarkup(
		<OutcomeBlock outcome="A routine stores its cron expression, and the sweep reads it." />,
	);
	expect(html).toContain("THE OUTCOME");
	expect(html).toContain("A routine stores its cron expression, and the sweep reads it.");
	expect(html).not.toContain("Empty until a pull request merges.");
});

test("says the outcome is empty until a pull request merges", () => {
	const html = renderToStaticMarkup(<OutcomeBlock outcome="" />);
	expect(html).toContain("THE OUTCOME");
	expect(html).toContain("Empty until a pull request merges.");
});
