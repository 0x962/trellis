export type EmptyWaveLineProps = {
	// The key of the wave group, which a drag over the line targets.
	group: string;
	height: number;
	// The offset inside the virtual body.
	top: number;
};

// The one line under the header of a wave that holds no ticket.
export function EmptyWaveLine({ group, height, top }: EmptyWaveLineProps) {
	return (
		<div
			data-group={group}
			style={{ height: `${height}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center border-b border-border px-5 text-sm text-fg-faint max-md:px-4"
		>
			No tickets in this wave.
		</div>
	);
}
