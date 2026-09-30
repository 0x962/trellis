import { ArrowClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { defaultSessionCleanup, type SessionCleanup } from "@trellis/api";
import { FailureState, IconButton, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SavedMark } from "../SavedMark";
import { CleanupPeriod } from "./components/CleanupPeriod";

export function CleanupSettings() {
	const { orpc } = useApp();
	const query = useQuery(orpc.settings.get.queryOptions({}));
	const { saved, save } = useSettingsDraft();
	const saving = useRef(false);
	const [busy, setBusy] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const value = saved?.sessionCleanup ?? defaultSessionCleanup;
	const update = async (patch: Partial<SessionCleanup>) => {
		if (saving.current) return false;
		saving.current = true;
		setBusy(true);
		const stored = await save({ sessionCleanup: { ...value, ...patch } });
		saving.current = false;
		setBusy(false);
		if (stored) setSavedAt(Date.now());
		return stored !== undefined;
	};
	return (
		<>
			{query.isError && (
				<FailureState
					title="Cleanup settings are unavailable."
					detail={query.error.message}
					action={
						<Tooltip content="Reload cleanup settings">
							<IconButton
								label="Reload cleanup settings"
								icon={<ArrowClockwise />}
								onClick={() => void query.refetch()}
							/>
						</Tooltip>
					}
				/>
			)}
			<CleanupPeriod
				label="Auto archive sessions"
				hint="Put inactive sessions in the archive. Keep their conversations and files."
				value={value.archiveAfterDays}
				defaultDays={3}
				busy={busy || !saved}
				loading={query.isPending}
				save={(archiveAfterDays) => update({ archiveAfterDays })}
			/>
			<CleanupPeriod
				label="Auto delete sessions"
				hint="Delete inactive sessions and their clean workspaces. Keep ticket agents and sessions with unsaved files."
				value={value.deleteAfterDays}
				defaultDays={7}
				busy={busy || !saved}
				loading={query.isPending}
				save={(deleteAfterDays) => update({ deleteAfterDays })}
			/>
			<div className="flex items-center justify-between gap-3 py-4">
				<p className="text-sm text-fg-muted">
					Cleanup runs each hour while Trellis runs. Pinned and active sessions stay.
				</p>
				<SavedMark savedAt={savedAt} />
			</div>
		</>
	);
}
