import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { VerdictBar } from "./VerdictBar";

// Before a click on `Merge`, the bar reads only the query client from the app
// context.
const queryClient = new QueryClient();
const app = { queryClient } as AppContext;

const revision = { headSha: "8b21f0caa1b2c3d4", meta: { baseRefName: "master" } } as unknown as ReviewRevision;

const render = (openThreads: number, unmetConditions: readonly string[], phone = false) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<VerdictBar
					pr="https://github.com/o/r/pull/1"
					revision={revision}
					openThreads={openThreads}
					unmetConditions={unmetConditions}
					phone={phone}
					onDone={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar counts the open threads and keeps Merge live with three unmet conditions", () => {
	const html = render(2, ["1 check failed", "1 of 4 evidence", "TRL-167 not merged"]);

	expect(html).toContain("2 open threads");
	expect(html).toContain("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
	expect(html).not.toMatch(/<button[^>]*aria-label="Merge"[^>]*disabled/);
});

test("a pull request with every condition met prints no condition line", () => {
	const html = render(1, []);

	expect(html).toContain("1 open thread");
	expect(html).not.toContain("not yet");
});

test("a phone draws no Merge and prints the reason in place of the conditions", () => {
	const html = render(2, ["1 check failed", "1 of 4 evidence"], true);

	expect(html).toContain("2 open threads");
	expect(html).toContain("A merge into an enterprise repository needs the desk.");
	expect(html).not.toMatch(/aria-label="Merge"/);
	expect(html).not.toContain("not yet");
});

test("a phone with every condition met still prints the reason", () => {
	const html = render(0, [], true);

	expect(html).toContain("A merge into an enterprise repository needs the desk.");
	expect(html).not.toMatch(/aria-label="Merge"/);
});
