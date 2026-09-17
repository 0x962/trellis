import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { Sheet } from "@trellis/ui";
import { type DiffAnchor, ReviewDiff, ReviewFiles, ReviewTabs } from "@trellis/ui/review";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useTheme } from "../../../lib/theme";
import { ReviewChecks } from "../ReviewChecks/ReviewChecks";
import { ReviewComment } from "../ReviewComment/ReviewComment";
import { type ReviewCommentInput, ReviewComposer } from "../ReviewComposer/ReviewComposer";
import { ReviewDiscussion } from "../ReviewDiscussion/ReviewDiscussion";
import { ReviewHeader } from "../ReviewHeader/ReviewHeader";
import { ReviewLive } from "../ReviewLive/ReviewLive";
import { ReviewRuns } from "../ReviewRuns/ReviewRuns";
import { ReviewStack } from "../ReviewStack/ReviewStack";
import { ReviewSubmit } from "../ReviewSubmit/ReviewSubmit";
import { ReviewSummary } from "../ReviewSummary/ReviewSummary";
import { DiffToolbar } from "./components/DiffToolbar/DiffToolbar";
import { ReviewPageSkeleton } from "./components/ReviewPageSkeleton";
import "@trellis/ui/review.css";

type FileRow = { path: string; type: string; additions: number; deletions: number };
export function ReviewPage({ pr, parent, syncHash = true }: { pr: string; parent?: ReactNode; syncHash?: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const { resolved: theme } = useTheme();
	const latest = useQuery(orpc.reviews.revision.queryOptions({ input: { pr } }));
	const [revision, setRevision] = useState<ReviewRevision | null>(null);
	const status = useQuery({
		...orpc.reviews.status.queryOptions({ input: { pr } }),
		enabled: revision !== null,
		refetchInterval: 45000,
	});
	const booted = useRef(false);
	const [tab, setTab] = useState(() => (syncHash ? location.hash.slice(1).split("?")[0] || "changes" : "changes"));
	const [mode, setMode] = useState<"split" | "unified">(() =>
		localStorage.getItem("trellis.review.mode") === "split" ? "split" : "unified",
	);
	const [files, setFiles] = useState<FileRow[]>([]);
	const [file, setFile] = useState("");
	const [fileFilter, setFileFilter] = useState("");
	const [fileSheet, setFileSheet] = useState(false);
	const [composer, setComposer] = useState<DiffAnchor | null>(null);
	const [submitOpen, setSubmitOpen] = useState(false);
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
	const addThread = useMutation({
		mutationFn: (comment: ReviewCommentInput) => client.reviews.add({ pr, ...comment }),
		onSuccess: () => {
			if (composer)
				localStorage.removeItem(
					`trellis.review.comment:${pr}:${composer.path}:${composer.side}:${composer.startLine}:${composer.line}`,
				);
			setComposer(null);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
		},
	});
	const refresh = useMutation({
		mutationFn: () => client.reviews.refresh({ pr }),
		onSuccess: (data) => {
			setRevision(data);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
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
		if (syncHash) history.replaceState(null, "", `#${value}`);
	};
	const loadFile = useCallback(
		async (path: string, side: "old" | "new") => {
			const result = await client.reviews.file({ pr, revisionId: revision!.id, path, side });
			return result.content;
		},
		[client, pr, revision],
	);
	const invalid = () => queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
	const allThreads = useMemo(
		() => (threads.data?.items ?? []).filter((thread) => thread.revisionId === revision?.id),
		[threads.data?.items, revision?.id],
	);
	const threadsById = useMemo(() => new Map(allThreads.map((thread) => [thread.id, thread])), [allThreads]);
	const openCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const thread of allThreads) {
			if (thread.status === "open") counts[thread.path] = (counts[thread.path] ?? 0) + 1;
		}
		return counts;
	}, [allThreads]);
	const renderThread = useCallback(
		(id: string) => {
			const thread = threadsById.get(id)!;
			return <ReviewComment key={thread.id} thread={thread} />;
		},
		[threadsById],
	);
	const fileNav = (
		<ReviewFiles
			search={fileFilter}
			onSearch={setFileFilter}
			files={files}
			selected={file}
			counts={openCounts}
			onSelect={(path) => {
				setFile(path);
				setFileSheet(false);
			}}
		/>
	);
	const displayRevision = revision ? { ...revision, meta: status.data ?? revision.meta } : null;
	return (
		<div className="review-page">
			<ReviewHeader
				pr={pr}
				parent={parent}
				revision={displayRevision}
				refreshing={refresh.isPending || composer !== null}
				onRefresh={() => refresh.mutate()}
				onSubmit={() => setSubmitOpen(true)}
			/>
			<div className="page-card review-workspace">
				<ReviewSummary
					pr={pr}
					revision={displayRevision}
					openCount={allThreads.filter((thread) => thread.status === "open").length}
				/>
				{revision && <ReviewStack pr={pr} />}
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
				<ReviewTabs
					value={tab}
					onValueChange={changeTab}
					count={allThreads.length}
					live={pr.includes("/canary-technologies-corp/canary/")}
				>
					{refresh.isError && (
						<p className="review-error" role="alert">
							{refresh.error.message}. Local comments remain available.
						</p>
					)}
					{threads.isError && (
						<p role="alert" className="review-error">
							{threads.error.message}
						</p>
					)}
					{tab === "changes" && revision === null && !refresh.isError && <ReviewPageSkeleton />}
					{tab === "changes" && revision !== null && (
						<div className="review-main">
							<aside className="review-files" aria-label="Changed files">
								{fileNav}
							</aside>
							<div className="review-content">
								<DiffToolbar
									mode={mode}
									onFiles={() => setFileSheet(true)}
									onMode={(value) => {
										setMode(value);
										localStorage.setItem("trellis.review.mode", value);
									}}
								/>

								<ReviewDiff
									filter={fileFilter}
									patch={revision.patch}
									loadFile={loadFile}
									revisionId={revision.id}
									threads={allThreads}
									mode={mode}
									theme={theme}
									selectedFile={file}
									renderThread={renderThread}
									composer={composer}
									renderComposer={() =>
										composer && (
											<ReviewComposer
												key={`${revision.id}:${composer.path}:${composer.side}:${composer.startLine}:${composer.line}`}
												anchor={composer}
												revisionId={revision.id}
												storageKey={`trellis.review.comment:${pr}:${composer.path}:${composer.side}:${composer.startLine}:${composer.line}`}
												onClose={() => {
													addThread.reset();
													setComposer(null);
												}}
												onSave={(comment) => addThread.mutate(comment)}
												pending={addThread.isPending}
												error={addThread.error?.message ?? null}
											/>
										)
									}
									onSelect={(anchor) => {
										addThread.reset();
										setComposer(anchor);
									}}
									onFiles={setFiles}
								/>
							</div>
						</div>
					)}
					{tab === "discussion" && (
						<ReviewDiscussion
							threads={allThreads}
							revision={displayRevision}
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
				</ReviewTabs>
			</div>
			{fileSheet && (
				<Sheet
					open
					title="Changed files"
					titleClassName="font-medium text-base"
					side="left"
					onOpenChange={(open) => !open && setFileSheet(false)}
				>
					<div className="review-file-sheet">{fileNav}</div>
				</Sheet>
			)}
			{submitOpen && (
				<ReviewSubmit
					pr={pr}
					headSha={revision!.headSha}
					onClose={() => setSubmitOpen(false)}
					onSubmitted={() => {
						setSubmitOpen(false);
						void invalid();
						void status.refetch();
					}}
				/>
			)}
		</div>
	);
}
