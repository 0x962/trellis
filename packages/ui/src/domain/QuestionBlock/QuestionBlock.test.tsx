import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionBlock, type QuestionBlockProps, type QuestionOption } from "./QuestionBlock";

// OP-52 of section 2, screen 7 in
// docs/research/trellis-for-one-human-and-many-agents.md.
const options: QuestionOption[] = [
	{ number: 1, text: "Leave it missed. Write a RoutineRun with a missed state so the person sees the gap." },
	{ number: 2, text: "Run it late. The sweep starts every due moment it finds, however old." },
];

const releases = [
	{
		identifier: "OP-33",
		title: "Service: One routine's failure does not end the sweep pass",
		link: <a href="/t/OP-33">OP-33</a>,
	},
];

const props: QuestionBlockProps = {
	options,
	recommendation: { option: 1, by: "crisp-fjord", reason: "A night audit reads a different day." },
	releases,
	picked: null,
	onPickedChange: () => {},
	reason: "",
	onReasonChange: () => {},
	answering: false,
	result: null,
	error: null,
	onAnswer: () => {},
};

const render = (overrides: Partial<QuestionBlockProps> = {}) =>
	renderToStaticMarkup(<QuestionBlock {...props} {...overrides} />);

// `Answer` is the one button of the block. This slice holds its `<button`
// tag and stops at the closing angle bracket, so an attribute of another
// element never reaches an assertion.
const answerButtonTag = (html: string) => {
	const open = html.lastIndexOf("<button", html.indexOf("Answer</"));
	return html.slice(open, html.indexOf(">", open) + 1);
};

describe("QuestionBlock", () => {
	test("numbers each option and writes the recommendation under its own option", () => {
		const html = render();

		expect(html).toContain("1. Leave it missed.");
		expect(html).toContain("2. Run it late.");
		const first = html.indexOf("1. Leave it missed.");
		const second = html.indexOf("2. Run it late.");
		expect(html.indexOf("crisp-fjord recommends this one.")).toBeGreaterThan(first);
		expect(html.indexOf("crisp-fjord recommends this one.")).toBeLessThan(second);
	});

	test("prints the reason under a label that names the recommended option", () => {
		const html = render();

		expect(html).toContain("Why crisp-fjord recommends 1");
		expect(html).toContain("A night audit reads a different day.");
	});

	test("names the recommended option without a name when nobody is named", () => {
		const html = render({ recommendation: { option: 2, by: null, reason: "The late run keeps the work." } });

		expect(html).toContain("Recommended.");
		expect(html).toContain("Why option 2 is recommended");
	});

	test("names each ticket the answer releases", () => {
		const html = render();

		expect(html).toContain("This answer releases");
		expect(html).toContain("OP-33");
		expect(html).toContain("Service: One routine&#x27;s failure does not end the sweep pass");
	});

	test("holds Answer shut while no option is picked", () => {
		expect(answerButtonTag(render())).toContain("disabled");
	});

	test("holds Answer shut while the reason is blank", () => {
		expect(answerButtonTag(render({ picked: 1 }))).toContain("disabled");
	});

	test("opens Answer once an option and a reason are there", () => {
		expect(answerButtonTag(render({ picked: 1, reason: "A missed night must stay visible." }))).not.toContain(
			"disabled",
		);
	});

	test("prints what the answer did", () => {
		const html = render({ result: "OP-52 is done. crisp-fjord on OP-33 has the answer." });

		expect(html).toContain("OP-52 is done. crisp-fjord on OP-33 has the answer.");
	});

	test("prints why the server refused the answer", () => {
		const html = render({ error: "This question lists 2 options. Pick one of them." });

		expect(html).toContain('role="alert"');
		expect(html).toContain("This question lists 2 options. Pick one of them.");
	});

	test("prints one line when the ticket lists no option", () => {
		const html = render({ options: [] });

		expect(html).toContain("The ticket lists no option to pick.");
		expect(html).not.toContain("<button");
	});

	test("never writes the word decide", () => {
		expect(render().toLowerCase()).not.toContain("decide");
	});
});
