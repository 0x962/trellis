import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceStrip } from "./EvidenceStrip";

const gap = {
	label: "console list",
	fillCommand: "trellis evidence add 56930 --kind console --file <path>",
	soft: false,
};
const copy = () => {};

test("prints the status and the note beside the title", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip status="proof complete" missing={[]} hasRecords={true} note="captured on 8b21f0c" onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).toContain("EVIDENCE");
	expect(html).toContain("proof complete · captured on 8b21f0c");
	expect(html).toContain("the records");
});

test("prints one line for each record the pull request still owes", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip status="needs the console list" missing={[gap]} hasRecords={true} onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).toContain("needs the console list");
	expect(html).toContain("console list");
	expect(html).toContain("missing");
	expect(html).toContain("trellis evidence add 56930 --kind console --file &lt;path&gt;");
});

test("prints due for a soft gap", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip
			status="needs the console list"
			missing={[{ ...gap, soft: true }]}
			hasRecords={true}
			onCopy={copy}
		/>,
	);

	expect(html).toContain("due");
	expect(html).not.toContain("missing");
});

test("prints placeholders and no count while the request is not complete", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip status="no proof yet" missing={[gap]} hasRecords={true} loading={true} onCopy={copy}>
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
		<EvidenceStrip status="proof complete" missing={[]} hasRecords={false} onCopy={copy} />,
	);

	expect(html).toContain("This pull request owes no evidence.");
});

test("hides the records of a pull request that carries none", () => {
	const html = renderToStaticMarkup(
		<EvidenceStrip status="no proof yet" missing={[gap]} hasRecords={false} onCopy={copy}>
			<p>the records</p>
		</EvidenceStrip>,
	);

	expect(html).not.toContain("the records");
	expect(html).toContain("console list");
});
