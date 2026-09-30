import { SessionCleanupSchema } from "@trellis/api";
import { Input, Switch } from "@trellis/ui";
import { useState } from "react";
import { SettingsRow } from "../../../SettingsRow";

export function CleanupPeriod({
	label,
	hint,
	value,
	defaultDays,
	busy,
	loading,
	save,
}: {
	label: string;
	hint: string;
	value: number | null;
	defaultDays: number;
	busy: boolean;
	loading: boolean;
	save: (value: number | null) => Promise<boolean>;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState<string>();
	const days = draft ?? String(value ?? defaultDays);
	const commit = async () => {
		const parsed = SessionCleanupSchema.shape.archiveAfterDays.safeParse(Number(days));
		if (!parsed.success) {
			setError("Enter a whole number of days greater than zero.");
			return;
		}
		setError(undefined);
		if (parsed.data === value || (await save(parsed.data))) setDraft(null);
	};
	return (
		<SettingsRow label={label} hint={hint}>
			<Switch
				label={label}
				checked={!loading && value !== null}
				disabled={busy || loading}
				onCheckedChange={(enabled) => {
					setError(undefined);
					setDraft(null);
					void save(enabled ? defaultDays : null);
				}}
			/>
			<Input
				label={`${label} after days without activity`}
				hint="Days without activity"
				hideLabel
				type="number"
				min={1}
				step={1}
				inputMode="numeric"
				value={loading ? "" : days}
				aria-busy={loading}
				placeholder={loading ? "Load…" : undefined}
				disabled={busy || loading || value === null}
				error={error}
				className="max-w-32 tabular-nums"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (value !== null && !busy) void commit();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
		</SettingsRow>
	);
}
