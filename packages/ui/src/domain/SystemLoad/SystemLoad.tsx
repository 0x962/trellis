import { cx } from "../../utils/cx";

export type SystemLoadProps = {
	cpuPercent: number | null;
	memoryPercent: number | null;
};

type LoadLevel = "average" | "bad" | "good";

const levelOf = (percent: number): LoadLevel => (percent >= 80 ? "bad" : percent >= 50 ? "average" : "good");

const toneOf: Record<LoadLevel, string> = {
	good: "text-success",
	average: "text-warning",
	bad: "text-danger",
};

function LoadValue({ label, name, percent }: { label: string; name: string; percent: number | null }) {
	const level = percent === null ? null : levelOf(percent);
	return (
		<span className="flex items-center justify-between gap-1">
			{percent === null ? (
				<span className="sr-only">{name} load unavailable</span>
			) : (
				<meter
					aria-label={`${name} load`}
					aria-valuetext={`${percent} percent, ${level}`}
					min={0}
					max={100}
					value={percent}
					className="sr-only"
				/>
			)}
			<span aria-hidden="true" className="contents">
				<span className="text-fg-faint">{label}</span>
				<span className={cx("w-7 text-right tabular", level !== null && toneOf[level])}>
					{percent === null ? "--" : `${percent}%`}
				</span>
			</span>
		</span>
	);
}

export function SystemLoad({ cpuPercent, memoryPercent }: SystemLoadProps) {
	return (
		<div className="flex w-16 shrink-0 flex-col text-xs leading-tight">
			<LoadValue label="CPU" name="CPU" percent={cpuPercent} />
			<LoadValue label="MEM" name="Memory" percent={memoryPercent} />
		</div>
	);
}
