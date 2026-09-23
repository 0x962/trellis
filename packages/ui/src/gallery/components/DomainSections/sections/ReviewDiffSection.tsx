import { useState } from "react";
import type { DiffFileGroup } from "../../../../review/ReviewDiff/diffGroups";
import { type DiffAnchor, ReviewDiff } from "../../../../review/ReviewDiff/ReviewDiff";
import { ReviewDiffSkeleton } from "../../../../review/ReviewDiff/ReviewDiffSkeleton";
import { ReviewThreadCard } from "../../../../review/ReviewThreadCard/ReviewThreadCard";
import { Section } from "../../Section";

// One changed file with a hunk of 24 lines, so the box scrolls and the reader
// sees the height of a code line against the height of a file header. The
// second file is deleted, and the third is a lock file, which puts one file in
// each of three risk groups.
const body = Array.from({ length: 18 }, (_, index) => ` const step${index + 1} = steps[${index}];`).join("\n");
const patch = [
	"diff --git a/apps/server/drizzle/0104_review_rows.sql b/apps/server/drizzle/0104_review_rows.sql",
	"--- a/apps/server/drizzle/0104_review_rows.sql",
	"+++ b/apps/server/drizzle/0104_review_rows.sql",
	"@@ -1,21 +1,22 @@ the rows of a review",
	body,
	"-ALTER TABLE review_rows ADD COLUMN height integer;",
	"+ALTER TABLE review_rows ADD COLUMN height integer NOT NULL DEFAULT 28;",
	"+ALTER TABLE review_rows ADD COLUMN coarse_height integer NOT NULL DEFAULT 44;",
	" COMMIT;",
	"diff --git a/packages/api/src/time.test.ts b/packages/api/src/time.test.ts",
	"deleted file mode 100644",
	"--- a/packages/api/src/time.test.ts",
	"+++ /dev/null",
	"@@ -1,2 +0,0 @@",
	"-test('the clock rounds down', () => {",
	"-\texpect(floorToMinute(t)).toBe(t);",
	"diff --git a/bun.lock b/bun.lock",
	"--- a/bun.lock",
	"+++ b/bun.lock",
	"@@ -1,1 +1,1 @@",
	'-  "react": "19.2.7",',
	'+  "react": "19.2.8",',
	"",
].join("\n");

const groups: DiffFileGroup[] = [
	{
		key: "risk",
		label: "Risk",
		files: [{ path: "apps/server/drizzle/0104_review_rows.sql", reasons: ["migration"] }],
	},
	{ key: "tests", label: "Tests", files: [{ path: "packages/api/src/time.test.ts", reasons: ["deleted test"] }] },
	{ key: "noise", label: "Noise", files: [{ path: "bun.lock", reasons: ["dependency"] }] },
];

const message = (id: string, body: string) => ({
	id,
	author: "backend-checks",
	kind: "agent",
	session: null,
	body,
	createdAt: "2026-09-23T09:00:00.000Z",
	version: 1,
	reactions: [],
});

// Three threads, one per state a reader must tell apart: open, resolved, and
// written against lines the file on screen holds no more.
const threads = {
	open: {
		...message("open", "The default of 28 belongs in one place, not in two columns."),
		replies: [],
		status: "open",
		resolvedBy: null,
	},
	resolved: {
		...message("resolved", "The migration runs after 0103, so the journal order holds."),
		replies: [],
		status: "resolved",
		resolvedBy: "navid",
	},
	outdated: {
		...message("outdated", "This column was named row_height before the rename."),
		replies: [],
		status: "open",
		resolvedBy: null,
	},
};

const anchors: DiffAnchor[] = [
	{ path: "apps/server/drizzle/0104_review_rows.sql", side: "new", line: 20, startLine: 20 },
	{ path: "apps/server/drizzle/0104_review_rows.sql", side: "new", line: 3, startLine: 3 },
];

const diffThreads = [
	{ ...anchors[0]!, id: "open", version: 1, updatedAt: "", revisionId: "r" },
	{ ...anchors[1]!, id: "resolved", version: 1, updatedAt: "", revisionId: "r" },
	{
		path: "apps/server/drizzle/0104_review_rows.sql",
		side: "new" as const,
		line: 400,
		startLine: 400,
		id: "outdated",
		version: 1,
		updatedAt: "",
		revisionId: "older",
		anchorLines: ["nothing in this file holds this text"],
	},
];

const box = "h-120 w-full overflow-hidden rounded-md border border-border bg-bg";

function Diff({ children }: { children: React.ReactNode }) {
	return <div className={box}>{children}</div>;
}

export function ReviewDiffSection() {
	const [read, setRead] = useState<ReadonlySet<string>>(() => new Set(["bun.lock"]));
	return (
		<>
			<Section
				name="ReviewDiff"
				note="three risk groups, each named above its first file; an added line green and a deleted line red; a thread open, one resolved, and one outdated at the top of its file; bun.lock marked read"
				className="block"
			>
				<Diff>
					<ReviewDiff
						patch={patch}
						revisionId="r"
						threads={diffThreads}
						groups={groups}
						mode="unified"
						theme="system"
						renderThread={(id, place) => (
							<ReviewThreadCard
								thread={threads[id as keyof typeof threads]}
								renderBody={(text) => <p>{text}</p>}
								onReply={async () => {}}
								onResolve={async () => {}}
								onEdit={async () => {}}
								anchor="0104_review_rows.sql:20"
								outdated={place.kind === "outdated" ? { lines: [] } : undefined}
							/>
						)}
						onSelect={() => {}}
						onFiles={() => {}}
						viewed={read}
						onViewed={(path, next) =>
							setRead((current) => {
								const set = new Set(current);
								if (next) set.add(path);
								else set.delete(path);
								return set;
							})
						}
					/>
				</Diff>
			</Section>
			<Section name="ReviewDiff empty" note="a revision that changes no text" className="block">
				<Diff>
					<ReviewDiff
						patch=""
						revisionId="r"
						threads={[]}
						mode="unified"
						theme="system"
						renderThread={() => null}
						onSelect={() => {}}
						onFiles={() => {}}
					/>
				</Diff>
			</Section>
			<Section name="ReviewDiff loading" note="the shape the pane holds while the revision loads" className="block">
				<Diff>
					<ReviewDiffSkeleton />
				</Diff>
			</Section>
		</>
	);
}
