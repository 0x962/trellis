import { useEffect, useState } from "react";
import { DoneWash, waveFillMs } from "../../../../domain/DoneWash";
import { StatusIcon } from "../../../../domain/StatusIcon";
import { Button } from "../../../../primitives/Button";
import { Section } from "../../Section";

// The share of the wave the circle holds before and after the last open
// ticket of the wave is marked done.
const before = 4 / 5;
const after = 1;

export function DoneWashSection() {
	const [playing, setPlaying] = useState(false);
	useEffect(() => {
		if (!playing) return;
		const timer = setTimeout(() => setPlaying(false), waveFillMs);
		return () => clearTimeout(timer);
	}, [playing]);
	return (
		<Section
			name="DoneWash"
			note="the green band of a row that is marked done; 640 ms, and the wave circle fills at 700 ms"
		>
			<Button onClick={() => setPlaying(true)}>Play</Button>
			<div className="w-80 overflow-hidden rounded-md border border-border bg-bg">
				<div className="flex h-11 items-center gap-2 border-b border-border bg-band px-5">
					<StatusIcon
						category="started"
						color="success"
						progress={playing ? after : before}
						label="4 of 5 done"
						className="wave-fill"
					/>
					<span className="text-sm text-fg-muted">Ship the check bar</span>
				</div>
				<div className="relative flex h-8 items-center gap-3 px-5 text-sm">
					{playing && <DoneWash />}
					<StatusIcon category={playing ? "done" : "started"} progress={0.75} label="Status" className="z-10" />
					<span className="z-10 font-mono text-sm text-fg-faint tabular">TRL-344</span>
					<span className="z-10 text-fg">Play confetti when every check passes</span>
				</div>
			</div>
		</Section>
	);
}
