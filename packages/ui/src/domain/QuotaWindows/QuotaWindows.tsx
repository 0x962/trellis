import { cx } from "../../utils/cx";
import { formatWhen } from "../../utils/formatWhen";

export type QuotaWindow = { id: string; label: string; usedPercent: number; resetsAt: string | null };

export type QuotaWindowsProps = {
	// The account name, which names each meter for a screen reader.
	name: string;
	windows: readonly QuotaWindow[];
};

// The color of a quota bar by how much of the window is used: green while
// less than half is used, yellow up to 80%, red from 80% up.
export const quotaFillClass = (usedPercent: number) =>
	usedPercent >= 80 ? "bg-danger" : usedPercent >= 50 ? "bg-warning" : "bg-success";

// One meter per quota window of a subscription account: the session
// window and the weekly window for Claude, and the same pair for Codex. The
// account card of the Usage page draws it.
export function QuotaWindows({ name, windows }: QuotaWindowsProps) {
	return (
		<>
			{windows.map((window) => {
				const used = Math.max(0, Math.min(100, window.usedPercent));
				return (
					<div key={window.id} className="flex flex-col gap-1">
						<div className="flex justify-between gap-2 text-sm">
							<span>{window.label}</span>
							<span className="tabular">{window.usedPercent}% used</span>
						</div>
						<div
							role="progressbar"
							aria-label={`${name}: ${window.label}`}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={used}
							aria-valuetext={`${window.usedPercent}% used`}
							className="h-2 w-full overflow-hidden rounded-hairline bg-border"
						>
							<div
								data-quota-fill=""
								className={cx("h-full rounded-hairline", quotaFillClass(used))}
								style={{ width: `${used}%` }}
							/>
						</div>
						{window.resetsAt && <p className="text-xs text-fg-muted tabular">Resets {formatWhen(window.resetsAt)}</p>}
					</div>
				);
			})}
		</>
	);
}
