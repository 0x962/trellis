import { expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { WaitsCell } from "./WaitsCell";

const dependency = (identifier: string, isQuestion = false): TicketSummary["waitsOn"][number] => ({
	identifier,
	title: `Ticket ${identifier}`,
	status: "todo",
	isQuestion,
});

test("prints nothing when no ticket holds this one back and the work has started", () => {
	expect(renderToStaticMarkup(<WaitsCell waitsOn={[]} ready={false} />)).toBe("");
});

test("prints ready when the ticket is Todo and no ticket holds it back", () => {
	const html = renderToStaticMarkup(<WaitsCell waitsOn={[]} ready={true} />);

	expect(html).toContain("ready");
	expect(html).toContain("text-fg-faint");
});

test("prints two identifiers and the separator between them", () => {
	const html = renderToStaticMarkup(<WaitsCell waitsOn={[dependency("OP-32"), dependency("OP-52")]} ready={false} />);

	expect(html).toContain("OP-32");
	expect(html).toContain("OP-52");
	expect(html).toContain("·");
	expect(html).not.toContain("+");
});

test("prints the count of the identifiers that do not fit", () => {
	const html = renderToStaticMarkup(
		<WaitsCell
			waitsOn={[dependency("OP-32"), dependency("OP-52"), dependency("OP-40"), dependency("OP-45")]}
			ready={false}
		/>,
	);

	expect(html).toContain("OP-32");
	expect(html).toContain("OP-52");
	expect(html).not.toContain("OP-40");
	expect(html).toContain("+2");
});

test("prints the yellow dot after a question and after no other ticket", () => {
	const html = renderToStaticMarkup(
		<WaitsCell waitsOn={[dependency("OP-32"), dependency("OP-52", true)]} ready={false} />,
	);

	expect(html).toContain("bg-warning");
	expect(html).toContain("OP-52 is a question for you.");
	expect(html).not.toContain("OP-32 is a question for you.");
});

test("prints no ready word while a ticket still holds this one back", () => {
	const html = renderToStaticMarkup(<WaitsCell waitsOn={[dependency("OP-32")]} ready={true} />);

	expect(html).not.toContain("ready");
	expect(html).toContain("OP-32");
});

test("each identifier links to the page of the ticket it names", () => {
	const html = renderToStaticMarkup(<WaitsCell waitsOn={[dependency("OP-32"), dependency("OP-52")]} ready={false} />);

	expect(html).toContain('href="/t/OP-32"');
	expect(html).toContain('href="/t/OP-52"');
});

test("an identifier carries the title of the ticket it names", () => {
	const html = renderToStaticMarkup(<WaitsCell waitsOn={[dependency("OP-32")]} ready={false} />);

	expect(html).toContain('title="Ticket OP-32"');
});
