import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BackendEvidence, type BackendEvidenceProps } from "./BackendEvidence";

const copy = () => {};

const empty: BackendEvidenceProps = {
	calls: [],
	runs: [],
	verify: [],
	tests: [],
	contracts: [],
	migration: null,
	picture: null,
	onCopy: copy,
};

const passed = {
	id: "01M30A0000000000000000VRF1",
	label: "verify record",
	command: "cd backend/canary && direnv exec . pytest canary/api/tests/test_staff_hotels.py",
	exit: 0,
	tail: "6 passed in 4.21s",
};

test("prints each verify command with its exit code and its tail under verification", () => {
	const html = renderToStaticMarkup(<BackendEvidence {...empty} verify={[passed]} />);

	expect(html).toContain("Verification");
	expect(html).toContain("verify record");
	expect(html).toContain("pytest canary/api/tests/test_staff_hotels.py");
	expect(html).toContain("exit 0");
	expect(html).toContain("6 passed in 4.21s");
	expect(html).not.toContain("text-danger");
});

test("prints each call as request and response blocks", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			calls={[
				{
					id: "01M30A0000000000000000CALL",
					method: "POST",
					path: "/api/tickets",
					request: '{"title":"First"}',
					status: 201,
					response: '{"identifier":"TST-1"}',
					server: "http://127.0.0.1:4571",
				},
			]}
		/>,
	);

	expect(html).toContain("POST");
	expect(html).toContain("/api/tickets");
	expect(html).toContain("status 201");
	expect(html).toContain("{&quot;title&quot;:&quot;First&quot;}");
	expect(html).toContain("{&quot;identifier&quot;:&quot;TST-1&quot;}");
});

test("prints each product run with command and output", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			runs={[
				{
					id: "01M30A0000000000000000RUN",
					command: "trellis tickets list",
					exit: 0,
					output: "TST-1 First",
					server: "http://127.0.0.1:4571",
				},
			]}
		/>,
	);

	expect(html).toContain("trellis tickets list");
	expect(html).toContain("exit 0");
	expect(html).toContain("TST-1 First");
});

test("draws the exit code of a failed command in the danger color", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence {...empty} verify={[{ ...passed, exit: 1, tail: "1 failed, 5 passed" }]} />,
	);

	expect(html).toContain("exit 1");
	expect(html).toContain("text-danger");
});

test("prints each test by name with the SHA it fails on and the SHA it passes on", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			tests={[
				{
					id: "01M30A0000000000000000TEST",
					state: "named",
					name: "test_staff_hotels_names_no_other_property",
					failsOn: "4c9a771",
					passesOn: "8b21f0c",
				},
			]}
		/>,
	);

	expect(html).toContain("test proof");
	expect(html).toContain("test_staff_hotels_names_no_other_property");
	expect(html).toContain("fails on 4c9a771 · passes on 8b21f0c");
});

test("prints the reason of a change that adds no test", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			tests={[{ id: "01M30A0000000000000000TEST", state: "none", reason: "the change deletes a dead branch" }]}
		/>,
	);

	expect(html).toContain("no new test · the change deletes a dead branch");
});

test("prints one contract as it reads before the change and after it", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			contracts={[
				{
					id: "01M30A0000000000000000CONT",
					state: "changed",
					before: "GET /api/private/staff-hotels · 403 for a service token",
					after: "GET /api/private/staff-hotels?user=<uuid> · 200 {properties: []}",
				},
			]}
		/>,
	);

	expect(html).toContain("contract table");
	expect(html).toContain("403 for a service token");
	expect(html).toContain("200 {properties: []}");
});

test("prints the words of a change that moves no contract", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence {...empty} contracts={[{ id: "01M30A0000000000000000CONT", state: "none" }]} />,
	);

	expect(html).toContain("no contract changed");
});

test("prints the migration file and the plan the agent wrote", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			migration={{
				plan: "phase: expand · lock: none · rollback: drop the column",
				filename: "0089_epic_resources.sql",
			}}
		/>,
	);

	expect(html).toContain("migration plan");
	expect(html).toContain("0089_epic_resources.sql");
	expect(html).toContain("phase: expand · lock: none · rollback: drop the column");
});

test("draws the picture in the page with the sentence of the agent", () => {
	const html = renderToStaticMarkup(
		<BackendEvidence
			{...empty}
			picture={{
				url: "/api/evidence/01M30A00000000000000000PIC/file",
				why: "The call path crosses from Operator into Canary.",
			}}
		/>,
	);

	expect(html).toContain('<img src="/api/evidence/01M30A00000000000000000PIC/file"');
	expect(html).toContain('alt="The call path crosses from Operator into Canary."');
	expect(html).toContain("aspect-ratio:16 / 10");
});

test("draws no row for a record the pull request does not carry", () => {
	const html = renderToStaticMarkup(<BackendEvidence {...empty} verify={[passed]} />);

	expect(html).not.toContain("test proof");
	expect(html).not.toContain("contract table");
	expect(html).not.toContain("migration plan");
	expect(html).not.toContain("<img");
});

test("draws nothing for a pull request that carries no backend record", () => {
	const html = renderToStaticMarkup(<BackendEvidence {...empty} />);

	expect(html).toBe('<div class="flex min-w-0 flex-col gap-3"></div>');
});
