import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceStrip } from "./EvidenceStrip";

const gap = { label: "console log", fillCommand: "trellis evidence add 56930 --kind console --file <path>" };
const copy = () => {};

test("prints the count and the note beside the title", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip present={5} required={5} missing={[]} hasRecords={true} note="captured on 8b21f0c" onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).toContain("EVIDENCE");
	expect(html).toContain("5 of 5 · captured on 8b21f0c");
	expect(html).toContain("the records");
});

test("prints one line for each record the pull request still owes", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip present={4} required={5} missing={[gap]} hasRecords={true} onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).toContain("4 of 5");
	expect(html).toContain("console log");
	expect(html).toContain("missing");
	expect(html).toContain("trellis evidence add 56930 --kind console --file &lt;path&gt;");
});

test("prints placeholders and no count while the request is not complete", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip present={0} required={5} missing={[gap]} hasRecords={true} loading={true} onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("reading");
	expect(html).not.toContain("0 of 5");
	expect(html).not.toContain("the records");
	expect(html).not.toContain("console log");
});

test("prints one sentence when the pull request owes nothing and carries no record", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip present={0} required={0} missing={[]} hasRecords={false} onCopy={copy} />,
	);

	expect(html).toContain("This pull request owes no evidence.");
});

test("hides the records of a pull request that carries none", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip present={0} required={5} missing={[gap]} hasRecords={false} onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).not.toContain("the records");
	expect(html).toContain("console log");
});
