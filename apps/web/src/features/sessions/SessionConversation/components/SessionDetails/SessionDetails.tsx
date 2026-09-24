import { Copy } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { AgentRun, AgentWorkspaceSummary } from "@trellis/api";
import { Button, CodeText, Dialog, IconButton, LineChanges, PropertyRow, Skeleton, Tooltip } from "@trellis/ui";
import { useRef } from "react";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { formatCount, relativeTime } from "../../../../../lib/format";

export type SessionDetailsProps = {
	run: AgentRun;
	// Undefined while the first read runs.
	summary: AgentWorkspaceSummary | undefined;
};

export type SessionDetailsDialogProps = SessionDetailsProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const startedFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

const plural = (count: number, word: string) => `${formatCount(count)} ${word}${count === 1 ? "" : "s"}`;

// A value a person pastes into a terminal: mono text that wraps, so the
// whole value is on screen, and a button that copies it. The button sits
// on the first line of the value and reaches the edge of the panel.
function Copyable({ value, label, message }: { value: string; label: string; message: string }) {
	return (
		<>
			<CodeText className="min-w-0 flex-1 break-all text-sm">{value}</CodeText>
			<Tooltip content={label}>
				<IconButton
					size="xs"
					className="-my-1 -mr-1.5"
					label={label}
					icon={<Copy />}
					onClick={() => void copyText(value, message)}
				/>
			</Tooltip>
		</>
	);
}

const Pending = () => <Skeleton width="w-32" height="h-2.5" />;

function Details({ run, summary }: SessionDetailsProps) {
	const { orpc } = useApp();
	const accounts = useQuery({
		...orpc.harnessAccounts.list.queryOptions({ input: {} }),
		enabled: run.accountId != null,
	});
	const account = accounts.data?.find((item) => item.id === run.accountId);
	const ready = summary?.state === "ready" ? summary : null;
	const commits =
		ready === null
			? []
			: [
					ready.ahead > 0 && `${formatCount(ready.ahead)} ahead`,
					ready.behind > 0 && `${formatCount(ready.behind)} behind`,
				].filter(Boolean);
	return (
		<dl className="flex flex-col gap-0.5" aria-busy={summary === undefined}>
			<PropertyRow label="Workspace" align="start">
				<Copyable value={run.workspaceId!} label="Copy workspace path" message="Copied the workspace path" />
			</PropertyRow>
			{summary?.state === "missing" && (
				<PropertyRow label="Git">
					<span className="text-fg-muted">The workspace directory is not on disk.</span>
				</PropertyRow>
			)}
			{summary?.state === "unreadable" && (
				<PropertyRow label="Git" align="start">
					<span className="min-w-0 break-words text-fg-muted">{summary.error}</span>
				</PropertyRow>
			)}
			{summary?.state !== "missing" && summary?.state !== "unreadable" && (
				<>
					<PropertyRow label="Branch" align="start">
						{ready === null ? (
							<Pending />
						) : ready.branch === null ? (
							<span className="text-fg-muted">Detached at {ready.head}</span>
						) : (
							<Copyable value={ready.branch} label="Copy agent branch" message="Copied the agent branch" />
						)}
					</PropertyRow>
					{(ready === null ? run.projectId !== null : ready.base !== null) && (
						<PropertyRow label="Base">
							{ready === null ? (
								<Pending />
							) : (
								<>
									<CodeText className="truncate text-sm">{ready.base}</CodeText>
									{commits.length > 0 && (
										<span className="shrink-0 text-sm text-fg-muted tabular">{commits.join(", ")}</span>
									)}
								</>
							)}
						</PropertyRow>
					)}
					<PropertyRow label="Changes">
						{ready === null ? (
							<Pending />
						) : ready.files === 0 ? (
							<span className="text-fg-muted">No changes</span>
						) : (
							<>
								<LineChanges value={ready} pending={false} align="start" />
								<span className="truncate text-sm text-fg-muted tabular">
									in {plural(ready.files, "file")}
									{ready.uncommitted > 0 && `, ${formatCount(ready.uncommitted)} not committed`}
								</span>
							</>
						)}
					</PropertyRow>
				</>
			)}
			{account !== undefined && (
				<PropertyRow label="Account">
					<span className="truncate">{account.name}</span>
				</PropertyRow>
			)}
			<PropertyRow label="Started">
				<time dateTime={run.createdAt} className="tabular">
					{startedFormat.format(new Date(run.createdAt))}
				</time>
				<span className="text-sm text-fg-muted tabular">{relativeTime(run.createdAt)}</span>
			</PropertyRow>
			{run.sessionId !== null && (
				<PropertyRow label="Resume ID" align="start">
					<Copyable value={run.sessionId} label="Copy resume ID" message="Copied the resume ID" />
				</PropertyRow>
			)}
		</dl>
	);
}

// The details of a session: where the workspace is, what it holds, which
// account runs it, and since when. The Session details row of
// `SessionActionsMenu` opens it. Below 768 px `Dialog` draws it as a sheet
// on the bottom edge of the screen.
//
// Focus lands on the list itself, so the first copy button does not open
// its tooltip on a click of the button.
export function SessionDetails({ run, summary, open, onOpenChange }: SessionDetailsDialogProps) {
	const list = useRef<HTMLDivElement>(null);
	return (
		<Dialog open={open} onOpenChange={onOpenChange} title="Session details" initialFocus={list}>
			<div ref={list} tabIndex={-1} className="outline-none">
				<Details run={run} summary={summary} />
			</div>
			<div className="flex justify-end">
				<Button onClick={() => onOpenChange(false)}>Close</Button>
			</div>
		</Dialog>
	);
}
