import { useEffect, useState } from "react";
import { CheckConfetti, confettiMs } from "../../../../domain/CheckConfetti";
import { type Check, CheckRibbon } from "../../../../domain/CheckRibbon";
import { Button } from "../../../../primitives/Button";
import { Section } from "../../Section";

const passing: Check[] = Array.from({ length: 12 }, (_, index) => ({ name: `check ${index + 1}`, bucket: "pass" }));

export function CheckConfettiSection() {
	// A run number, so a second press mounts a new set of pieces and the
	// animations start from their first frame again.
	const [run, setRun] = useState(0);
	const [playing, setPlaying] = useState(false);
	useEffect(() => {
		if (!playing) return;
		const timer = setTimeout(() => setPlaying(false), confettiMs);
		return () => clearTimeout(timer);
	}, [playing]);
	return (
		<Section name="CheckConfetti" note="seven ribbon pieces over a wide check bar; 1056 ms">
			<Button
				onClick={() => {
					setRun((current) => current + 1);
					setPlaying(true);
				}}
			>
				Play
			</Button>
			{/* The pieces reach 19 px above the bar and 22 px below it, so the
			    box that holds the bar leaves that much room around it. */}
			<div className="relative flex h-16 w-64 items-center justify-center rounded-md border border-border bg-bg">
				<span className="relative">
					<CheckRibbon checks={passing} size="wide" tooltip={false} />
					{playing && <CheckConfetti key={run} />}
				</span>
			</div>
		</Section>
	);
}
