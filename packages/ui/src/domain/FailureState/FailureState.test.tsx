import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../primitives/Button";
import { FailureState, type FailureStateProps } from "./FailureState";

const markup = (props: Partial<FailureStateProps>) =>
	renderToStaticMarkup(<FailureState title="The agent stopped before it finished" {...props} />);

describe("FailureState title", () => {
	test("prints the title", () => {
		expect(markup({})).toContain("The agent stopped before it finished");
	});

	test("draws no picture, so the words take the top of the pane", () => {
		expect(markup({ variant: "page" })).not.toContain("<img");
	});
});

describe("FailureState recovery", () => {
	test("says nothing when trellis does nothing", () => {
		const html = markup({});

		expect(html).not.toContain("trying again");
		expect(html).not.toContain("waiting for the server");
	});

	test("says that trellis is trying again", () => {
		expect(markup({ recovery: "retrying" })).toContain("Trellis is trying again.");
	});

	test("turns an arc while trellis tries again", () => {
		expect(markup({ recovery: "retrying" })).toContain("animate-spin");
	});

	test("says that trellis waits for the server", () => {
		const html = markup({ recovery: "waiting" });

		expect(html).toContain("Trellis is waiting for the server, and opens this page again when the server answers.");
		expect(html).not.toContain("animate-spin");
	});
});

describe("FailureState actions", () => {
	test("draws no action row when the caller passes none", () => {
		expect(markup({})).not.toContain("<button");
	});

	test("draws the first action before the second", () => {
		const html = markup({
			action: (
				<Button size="md" data-first="">
					Start the agent
				</Button>
			),
			secondAction: (
				<Button size="md" variant="quiet" data-second="">
					Open the workspace
				</Button>
			),
		});

		expect(html.indexOf("data-first")).toBeGreaterThan(-1);
		expect(html.indexOf("data-first")).toBeLessThan(html.indexOf("data-second"));
	});
});

describe("FailureState detail", () => {
	const processLine =
		"Process /Users/nk/Library/Application Support/Trellis/releases/b726b5e3/bin/node exited with code 1";

	test("keeps the raw text out of the title", () => {
		const html = markup({ detail: processLine });

		expect(html.indexOf(processLine)).toBeGreaterThan(html.indexOf("</h3>"));
	});

	test("holds the raw text in a closed disclosure", () => {
		const html = markup({ detail: processLine });

		expect(html).toContain("<details");
		expect(html).not.toContain("<details open");
		expect(html).toContain("Details</summary>");
		expect(html).toContain(processLine);
	});

	test("draws no disclosure without a detail", () => {
		expect(markup({})).not.toContain("<details");
	});

	test("draws no disclosure for an empty detail", () => {
		expect(markup({ detail: null })).not.toContain("<details");
	});
});
