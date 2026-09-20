import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { VerdictBar } from "./VerdictBar";

// Before a click on `Merge`, the bar reads only the query client from the app
// context. The test gives that one field.
const queryClient = new QueryClient();
const app = { queryClient } as AppContext;

const revision = { headSha: "8b21f0caa1b2c3d4", meta: { baseRefName: "master" } } as ReviewRevision;

const render = (drafts: number, unmet: readonly string[]) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<VerdictBar
					pr="https://github.com/o/r/pull/1"
					revision={revision}
					drafts={drafts}
					unmet={unmet}
					onDone={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar counts the drafts and keeps Merge live with three unmet conditions", () => {
	const html = render(2, ["1 check failed", "1 of 4 evidence", "TRL-167 not merged"]);

	expect(html).toContain("2 drafts");
	expect(html).toContain("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
	expect(html).not.toMatch(/<button[^>]*aria-label="Merge"[^>]*disabled/);
});

test("a pull request with every condition met prints no condition line", () => {
	const html = render(1, []);

	expect(html).toContain("1 draft");
	expect(html).not.toContain("not yet");
});
