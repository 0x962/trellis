import type { Status } from "@trellis/api";
import { Textarea } from "@trellis/ui";
import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { autosaveDelayMs } from "../../ticket/Description/hooks/useDescriptionAutosave";

export type StatusDescriptionFieldProps = {
	project: string;
	status: Status;
};

// The contract caps a status description at this many characters.
const maxLength = 2000;

// The markdown describes when to use this status.
// The field saves `autosaveDelayMs` after the last change,
// or at once on blur, and each save writes the description alone, so the
// other fields of the status row keep their own Save button.
export function StatusDescriptionField({ project, status }: StatusDescriptionFieldProps) {
	const { client, orpc, queryClient, scheduler } = useApp();
	const hintId = useId();
	const [value, setValue] = useState(status.description);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
	const [message, setMessage] = useState<string | null>(null);
	const pending = useRef<string | null>(null);
	const timer = useRef<unknown>(undefined);

	const save = async (description: string) => {
		setSaveState("saving");
		try {
			const stored = await client.statuses.update({ project, status: status.id, description });
			queryClient.setQueryData(orpc.statuses.list.queryKey({ input: { project } }), (current) =>
				current === undefined
					? current
					: { ...current, statuses: current.statuses.map((entry) => (entry.id === stored.id ? stored : entry)) },
			);
			setMessage(null);
			setSaveState("saved");
		} catch (error) {
			setMessage((error as Error).message);
			setSaveState("idle");
		}
	};

	const flush = () => {
		if (timer.current !== undefined) scheduler.clearTimeout(timer.current);
		timer.current = undefined;
		const description = pending.current;
		if (description === null) return;
		pending.current = null;
		void save(description);
	};
	const latestFlush = useRef(flush);
	latestFlush.current = flush;

	// An edit still in its quiet window saves when the row unmounts.
	useEffect(() => () => latestFlush.current(), []);

	const change = (next: string) => {
		setValue(next);
		pending.current = next;
		if (timer.current !== undefined) scheduler.clearTimeout(timer.current);
		timer.current = scheduler.setTimeout(() => latestFlush.current(), autosaveDelayMs);
	};

	return (
		<div className="flex flex-col gap-1">
			<Textarea
				label={`Description for ${status.name}`}
				rows={3}
				maxLength={maxLength}
				value={value}
				invalid={message !== null}
				aria-describedby={hintId}
				className="text-sm"
				onChange={(event) => change(event.target.value)}
				onBlur={flush}
			/>
			<div id={hintId} className="flex items-center justify-between gap-3 text-xs text-fg-faint">
				<span>Markdown. Describe when to use this status.</span>
				<span className="flex shrink-0 items-center gap-2">
					{saveState !== "idle" && <span>{saveState === "saving" ? "Saving…" : "Saved"}</span>}
					<span className="tabular">
						{value.length} / {maxLength}
					</span>
				</span>
			</div>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</div>
	);
}
