import { useEffect, useId, useState } from "react";
import { Input } from "../../../../primitives/Input";

export type WaitPeriodFieldProps = {
	seconds: number;
	busy: boolean;
	onChange: (seconds: number) => void;
};

export function WaitPeriodField({ seconds, busy, onChange }: WaitPeriodFieldProps) {
	const [draft, setDraft] = useState(String(seconds));
	const [error, setError] = useState<string | null>(null);
	const descriptionId = useId();
	const errorId = useId();

	useEffect(() => {
		setDraft(String(seconds));
		setError(null);
	}, [seconds]);

	const commit = () => {
		const value = Number(draft);
		if (!Number.isInteger(value) || value < 1 || value > 3600) {
			setError("Enter a whole number from 1 to 3,600.");
			return;
		}
		setError(null);
		if (value !== seconds) onChange(value);
	};

	return (
		<div className="w-40">
			<Input
				label="Wait period in seconds"
				type="number"
				min={1}
				max={3600}
				step={1}
				inputMode="numeric"
				value={draft}
				disabled={busy}
				invalid={error !== null}
				aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
				className="tabular-nums pointer-coarse:h-11"
				onChange={(event) => {
					setDraft(event.currentTarget.value);
					setError(null);
				}}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") {
						event.preventDefault();
						setDraft(String(seconds));
						setError(null);
					}
				}}
			/>
			<p id={descriptionId} className="mt-1 text-xs text-fg-muted">
				From 1 second to 1 hour.
			</p>
			{error && (
				<p id={errorId} role="alert" className="mt-1 text-xs text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
