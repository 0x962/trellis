import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { groupHeaderHeight } from "../rowHeights";
import { GroupHeader, phoneGroupHeaderHeight } from "./GroupHeader";

const markup = (props: Partial<Parameters<typeof GroupHeader>[0]>) =>
	renderToStaticMarkup(
		<GroupHeader group="w06" label="Group by turn" count={6} expanded={true} onToggle={() => {}} {...props} />,
	);

describe("GroupHeader count slot", () => {
	test("prints the rows of the person after the counts of the wave", () => {
		expect(markup({ countLabel: "0/6", forYou: 1 })).toContain("0/6 · 1 for you");
	});

	test("prints no wave word after the count", () => {
		expect(markup({ countLabel: "0/2", forYou: 1 })).toContain("0/2 · 1 for you");
		expect(markup({ countLabel: "0/2", forYou: 1 })).not.toContain("Later");
	});

	test("prints no count of the person when no row waits for the person", () => {
		expect(markup({ countLabel: "3/3", forYou: 0 })).toContain("3/3");
		expect(markup({ countLabel: "3/3", forYou: 0 })).not.toContain("for you");
	});
});

describe("GroupHeader actions and height", () => {
	test("draws the Start wave button when the header can start its wave", () => {
		expect(markup({ onStart: () => {} })).toContain('aria-label="Start wave"');
		expect(markup({})).not.toContain("Start wave");
	});

	test("stands at the table header height that the virtualizer reserves", () => {
		expect(markup({})).toContain(`height:${groupHeaderHeight}px`);
		expect(markup({ phone: true })).toContain(`height:${phoneGroupHeaderHeight}px`);
	});
});

describe("GroupHeader wave progress", () => {
	test("draws an empty grey circle when no ticket is complete", () => {
		const html = markup({ completedCount: 0, totalCount: 6, countLabel: "0/6" });

		expect(html).toContain('aria-label="0 of 6 done"');
		expect(html).toContain('data-category="todo"');
	});

	test("draws a partial green circle when some tickets are complete", () => {
		const html = markup({ completedCount: 3, totalCount: 6, countLabel: "3/6" });

		expect(html).toContain('aria-label="3 of 6 done"');
		expect(html).toContain('data-category="started"');
		expect(html).toContain('data-color="success"');
		expect(html).toContain('data-progress="0.5"');
	});

	test("draws a full green circle with a check when every ticket is complete", () => {
		const html = markup({ completedCount: 6, totalCount: 6, countLabel: "6/6", done: true });

		expect(html).toContain('aria-label="6 of 6 done"');
		expect(html).toContain('data-category="done"');
		expect(html).toContain('data-color="success"');
		expect(html).not.toContain("data-done-mark");
	});
});
