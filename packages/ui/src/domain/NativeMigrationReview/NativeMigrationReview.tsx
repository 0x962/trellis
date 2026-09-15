import { Archive, FolderOpen } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Tooltip } from "../../primitives/Tooltip";

type Assignment = {
	id: string;
	source: string;
	runtime: string;
	state: string;
	role: string;
	workspaceId: string | null;
	terminalId: string | null;
	conversationId: string | null;
};
export function NativeMigrationReview({
	version,
	directory,
	agents,
	blockers,
	processing,
	error,
	onDirectoryChange,
	onChooseDirectory,
	onRetire,
	onApply,
}: {
	version: string;
	directory: string;
	agents: Assignment[];
	blockers: { id: string; kind: string; reason: string }[];
	processing: boolean;
	error?: string;
	onDirectoryChange: (value: string) => void;
	onChooseDirectory?: () => void;
	onRetire: (id: string, source: string) => void;
	onApply: () => void;
}) {
	const [confirmed, setConfirmed] = useState(false);
	return (
		<div className="flex min-w-0 flex-col gap-4 text-sm">
			<p>
				Trellis preserves tickets, files, conversations, and assignment history. Local execution starts paused and the
				repository requires your trust.
			</p>
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<Input
						label="Local repository directory"
						value={directory}
						disabled={processing}
						onValueChange={onDirectoryChange}
					/>
				</div>
				{onChooseDirectory && (
					<Tooltip content="Choose repository directory">
						<IconButton
							label="Choose repository directory"
							icon={<FolderOpen />}
							disabled={processing}
							onClick={onChooseDirectory}
						/>
					</Tooltip>
				)}
			</div>
			{agents.length > 0 && (
				<section aria-label="Recorded assignments" className="flex flex-col gap-2">
					<h3 className="font-medium">Recorded assignments</h3>
					<ul className="flex max-h-64 select-text flex-col gap-3 overflow-auto">
						{agents.map((agent) => (
							<li key={`${agent.source}:${agent.id}`} className="rounded-md border border-border p-3">
								<div className="flex items-center gap-2">
									<p className="flex-1 font-medium">
										{agent.runtime} · {agent.role} · {agent.state}
									</p>
									{agent.runtime !== "native" &&
										blockers.some((blocker) => blocker.kind === "agent" && blocker.id === agent.id) && (
											<Tooltip content="Retire this external assignment after its process stops">
												<IconButton
													label={`Retire assignment ${agent.id}`}
													icon={<Archive />}
													disabled={processing}
													onClick={() => onRetire(agent.id, agent.source)}
												/>
											</Tooltip>
										)}
								</div>
								<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all font-mono text-xs">
									<dt>Assignment</dt>
									<dd>{agent.id}</dd>
									<dt>Workspace</dt>
									<dd>{agent.workspaceId ?? "Not recorded"}</dd>
									<dt>Terminal</dt>
									<dd>{agent.terminalId ?? "Not recorded"}</dd>
									<dt>Conversation</dt>
									<dd>{agent.conversationId ?? "Not recorded"}</dd>
								</dl>
							</li>
						))}
					</ul>
				</section>
			)}
			{blockers.length > 0 && (
				<section aria-label="Migration blockers" className="flex flex-col gap-2">
					<h3 className="font-medium">Resolve these items first</h3>
					<ul className="flex max-h-48 flex-col gap-2 overflow-auto">
						{blockers.map((blocker) => (
							<li key={`${blocker.kind}:${blocker.id}`} className="break-words">
								<p>{blocker.reason}</p>
								<p className="break-all font-mono text-xs text-fg-muted">
									{blocker.kind}: {blocker.id}
								</p>
							</li>
						))}
					</ul>
					<p className="text-fg-muted">
						Cancel uncertain deliveries in the manager queue. Stop or complete active checks and flows before you
						refresh this preview.
					</p>
				</section>
			)}
			<details className="text-xs text-fg-muted">
				<summary>Preview version</summary>
				<p className="select-text break-all font-mono">{version}</p>
			</details>
			<label className="flex items-start gap-2">
				<input
					type="checkbox"
					checked={confirmed}
					disabled={processing}
					onChange={(event) => setConfirmed(event.target.checked)}
				/>
				Keep automatic dispatch paused and require repository trust before launch
			</label>
			{error && (
				<p role="alert" className="text-danger">
					{error}
				</p>
			)}
			<Button
				variant="primary"
				processing={processing}
				disabled={!confirmed || blockers.length > 0 || !directory.startsWith("/")}
				onClick={onApply}
			>
				Confirm local execution
			</Button>
		</div>
	);
}
