import { List } from "@phosphor-icons/react";
import ReviewWorker from "@pierre/diffs/worker/worker.js?worker";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { IconButton, Sheet, Tooltip } from "@trellis/ui";
import { type DiffAnchor, ReviewDiff, ReviewFiles } from "@trellis/ui/review";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { useTheme } from "../../../lib/theme";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { type DraftFinding, ReviewComposer } from "../ReviewComposer/ReviewComposer";
import { ReviewDiscussion } from "../ReviewDiscussion/ReviewDiscussion";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { ReviewLive } from "../ReviewLive/ReviewLive";
import { ReviewRuns } from "../ReviewRuns/ReviewRuns";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import { ReviewSubmit } from "../ReviewSubmit/ReviewSubmit";
import { ReviewMarkdown } from "./ReviewMarkdown";
import "@trellis/ui/review.css";

const workerFactory = () => new ReviewWorker();
type FileRow = { path: string; type: string; additions: number; deletions: number };
export function ReviewPage({ pr }: { pr: string }) {
	const { client, orpc, queryClient } = useApp();
	const actor = useActor();
	const { resolved: theme } = useTheme();
	const status = useQuery({ ...orpc.reviews.status.queryOptions({ input: { pr } }), refetchInterval: 45000 });
	const latest = useQuery(orpc.reviews.revision.queryOptions({ input: { pr } }));
	const [revision, setRevision] = useState<ReviewRevision | null>(null);
	const booted = useRef(false);
	const [tab, setTab] = useState(() => location.hash.slice(1).split("?")[0] || "changes");
	const [mode, setMode] = useState<"split" | "unified">(() =>
		localStorage.getItem("trellis.review.mode") === "split" ? "split" : "unified",
	);
	const [files, setFiles] = useState<FileRow[]>([]);
	const [file, setFile] = useState("");
	const [fileFilter, setFileFilter] = useState("");
	const [fileSheet, setFileSheet] = useState(false);
	const [composer, setComposer] = useState<DiffAnchor | null>(null);
	const [submitOpen, setSubmitOpen] = useState(false);
	const storageKey = `trellis.review.drafts:${actor?.name}:${pr}`;
	const [drafts, setDrafts] = useState<DraftFinding[]>(() => JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
	const saveDrafts = (next: DraftFinding[]) => {
		setDrafts(next);
		localStorage.setItem(storageKey, JSON.stringify(next));
	};
	const threads = useQuery({
		...orpc.reviews.list.queryOptions({ input: { pr, all: true } }),
		queryFn: async () => {
			const items: ReviewThread[] = [];
			let total = 0;
			let open = 0;
			for (let offset = 0; ; offset += 500) {
				const page = await client.reviews.list({ pr, all: true, offset, limit: 500 });
				items.push(...page.items);
				total = page.total;
				open = page.open;
				if (page.items.length < 500) break;
			}
			return { items, total, open };
		},
	});
	const submissions = useQuery(orpc.reviews.history.queryOptions({ input: { pr } }));
	const refresh = useMutation({
		mutationFn: () => client.reviews.refresh({ pr }),
		onSuccess: (data) => {
			setRevision(data);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			void status.refetch();
			queryClient.setQueryData(orpc.reviews.revision.queryKey({ input: { pr } }), data);
		},
	});
	useEffect(() => {
		if (booted.current || !latest.isSuccess) return;
		booted.current = true;
		if (latest.data) setRevision(latest.data);
		else refresh.mutate();
	}, [latest.isSuccess, latest.data, refresh.mutate]);
	const changeTab = (value: string) => {
		setTab(value);
		history.replaceState(null, "", `#${value}`);
	};
	const loadFile = useCallback(
		async (path: string, side: "old" | "new") => {
			const result = await client.reviews.file({ pr, revisionId: revision!.id, path, side });
			return result.content;
		},
		[client, pr, revision],
	);
	const onSelect = useCallback((anchor: DiffAnchor) => setComposer(anchor), []);
	const invalid = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
	};
	const allThreads = threads.data?.items ?? [];
	const renderThread = (id: string) => {
		const draft = drafts.find((draft) => draft.id === id);
		if (draft)
			return (
				<article className="review-thread" aria-label="Draft comment">
					<div className="review-message">
						<strong>
							Draft · {draft.path}:{draft.startLine}–{draft.line}
						</strong>
						<ReviewMarkdown body={draft.body} />
						<p className="review-meta">Submit the review to share this finding.</p>
					</div>
				</article>
			);
		const t = allThreads.find((t) => t.id === id)!;
		return <ReviewComment key={t.id} thread={t} />;
	};
	const fileNav = (
		<ReviewFiles
			search={fileFilter}
			onSearch={setFileFilter}
			files={files}
			selected={file}
			counts={Object.fromEntries(
				files.map((f) => [
					f.path,
					allThreads.filter((t) => t.path === f.path && t.status === "open").length +
						drafts.filter((d) => d.path === f.path).length,
				]),
			)}
			onSelect={(path) => {
				setFile(path);
				setFileSheet(false);
			}}
		/>
	);
	const displayRevision = revision ? { ...revision, meta: status.data ?? revision.meta } : null;
	const outdated = allThreads.filter((t) => t.revisionId !== revision?.id || !files.some((f) => f.path === t.path));
	return (
		<div className="review-page">
			<ReviewHeader
				pr={pr}
				revision={displayRevision}
				openCount={threads.data?.open ?? 0}
				draftCount={drafts.length}
				mode={mode}
				setMode={(m) => {
					setMode(m);
					localStorage.setItem("trellis.review.mode", m);
				}}
				refreshing={refresh.isPending || composer !== null}
				onRefresh={() => refresh.mutate()}
				onComment={() => setComposer({ path: file || files[0]?.path || "", line: 1, startLine: 1, side: "new" })}
				onSubmit={() => setSubmitOpen(true)}
			/>
			<ReviewStack pr={pr} />
			{status.isError && (
				<p role="alert" className="review-notice">
					GitHub status: {status.error.message}
				</p>
			)}
			{revision &&
				status.data &&
				(status.data.headRefOid !== revision.headSha || status.data.baseRefOid !== revision.baseSha) && (
					<button type="button" className="review-notice" onClick={() => refresh.mutate()}>
						The PR has a new revision. Refresh to review it. Current comments keep their original anchors.
					</button>
				)}
			{status.data?.mergeable === "CONFLICTING" && (
				<p className="review-notice">
					This PR has merge conflicts.{" "}
					<a href={`${pr}/conflicts`} target="_blank" rel="noreferrer">
						Open conflicts on GitHub
					</a>
				</p>
			)}
			<nav className="review-tabs" aria-label="Review sections">
				{[
					"changes",
					"discussion",
					"checks",
					"runs",
					...(pr.includes("/canary-technologies-corp/canary/") ? ["live"] : []),
				].map((t) => (
					<button type="button" key={t} aria-current={tab === t ? "page" : undefined} onClick={() => changeTab(t)}>
						{t === "live" ? "Live Branch" : t.charAt(0).toUpperCase() + t.slice(1)}
						{t === "discussion"
							? ` (${allThreads.length}${drafts.length ? ` + ${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}` : ""})`
							: ""}
					</button>
				))}
			</nav>
			{refresh.isError && (
				<p className="review-error" role="alert">
					{refresh.error.message}. Local comments remain available.
				</p>
			)}
			{refresh.isPending && (
				<p className="review-notice" role="status">
					Fetch the PR revision…
				</p>
			)}
			{threads.isError && (
				<p role="alert" className="review-error">
					{threads.error.message}
				</p>
			)}
			{tab === "changes" && (
				<div className="review-main">
					<aside className="review-files" aria-label="Changed files">
						{fileNav}
					</aside>
					<div className="review-content">
						<div className="review-mobile-files">
							<Tooltip content="Changed files">
								<IconButton label="Changed files" icon={<List />} onClick={() => setFileSheet(true)} />
							</Tooltip>
						</div>
						{outdated.length > 0 && (
							<button type="button" className="review-notice" onClick={() => changeTab("discussion")}>
								{outdated.length} threads have older or unknown anchors. Read them in Discussion.
							</button>
						)}
						{revision ? (
							<ReviewDiff
								filter={fileFilter}
								workerFactory={workerFactory}
								patch={revision.patch}
								loadFile={loadFile}
								revisionId={revision.id}
								threads={[...allThreads, ...drafts.map((d) => ({ ...d, version: 1, updatedAt: d.id }))]}
								mode={mode}
								theme={theme}
								selectedFile={file}
								renderThread={renderThread}
								onSelect={onSelect}
								onFiles={setFiles}
							/>
						) : (
							<p className="review-scroll">Refresh from GitHub to load the diff.</p>
						)}
					</div>
				</div>
			)}
			{tab === "discussion" && (
				<ReviewDiscussion
					drafts={drafts}
					threads={allThreads}
					revision={displayRevision}
					submissions={submissions.data ?? []}
					saveDrafts={saveDrafts}
					renderThread={renderThread}
					onJump={(thread) => {
						void (async () => {
							if (thread.revisionId && thread.revisionId !== revision?.id)
								setRevision(await client.reviews.revision({ pr, id: thread.revisionId }));
							setFile(thread.path);
							changeTab("changes");
						})();
					}}
				/>
			)}
			{tab === "checks" && <ReviewChecks revision={displayRevision} />}
			{tab === "runs" && <ReviewRuns pr={pr} />}
			{tab === "live" && displayRevision && (
				<ReviewLive pr={pr} revision={displayRevision} onRefresh={() => refresh.mutate()} />
			)}
			{fileSheet && (
				<Sheet open title="Changed files" side="left" onOpenChange={(open) => !open && setFileSheet(false)}>
					<div className="review-scroll">{fileNav}</div>
				</Sheet>
			)}
			{composer && (
				<ReviewComposer
					anchor={composer}
					revisionId={revision?.id ?? null}
					storageKey={`${storageKey}:compose:${composer.path}:${composer.side}:${composer.startLine}:${composer.line}`}
					onClose={() => setComposer(null)}
					onSave={(d) => saveDrafts([...drafts, d])}
				/>
			)}
			{submitOpen && (
				<ReviewSubmit
					pr={pr}
					revisionId={revision?.id ?? null}
					drafts={drafts}
					threads={allThreads}
					onClose={() => setSubmitOpen(false)}
					onSubmitted={() => {
						saveDrafts([]);
						setSubmitOpen(false);
						changeTab("discussion");
						void invalid();
					}}
				/>
			)}
		</div>
	);
}
