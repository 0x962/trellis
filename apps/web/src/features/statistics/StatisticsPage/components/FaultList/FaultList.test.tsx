import { expect, test } from "bun:test";
import type { StatisticsFault } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { FaultList } from "./FaultList";

const fault = (fields: Partial<StatisticsFault> = {}): StatisticsFault => ({
	kind: "reviewMessageHeld",
	count: 5,
	oldest: { identifier: "TRL-370", title: "Flow waiver reason", since: "2026-09-20T12:00:00.000Z" },
	...fields,
});

const render = (faults: StatisticsFault[]) => renderToStaticMarkup(<FaultList faults={faults} />);

test("names the oldest case and counts the rest", () => {
	const markup = render([fault()]);

	expect(markup).toContain("Review message held, the ticket runs no agent");
	expect(markup).toContain("TRL-370");
	expect(markup).toContain("4 more of this fault.");
	expect(markup).toContain("Start an agent on the ticket.");
});

test("says so when one case is the whole fault", () => {
	expect(render([fault({ count: 1 })])).toContain("This is the only one.");
});

test("prints no ticket for a review message that names none", () => {
	const markup = render([
		fault({
			kind: "reviewMessageFailed",
			oldest: { identifier: null, title: null, since: "2026-09-20T12:00:00.000Z" },
		}),
	]);

	expect(markup).toContain("No ticket");
	expect(markup).not.toContain("/t/");
});

test("says that nothing is broken while no fault has a case", () => {
	expect(render([])).toContain("Nothing is broken.");
});
