import type { TicketSummary, WaveSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";
import { orderWaves } from "../waveGroups";

// A move changes two positions inside one state section of the displayed
// order. Every wave outside that pair keeps its saved position.
export const movedRefs = (waves: readonly WaveSummary[], id: string, step: -1 | 1): string[] | null => {
	const displayedWaves = orderWaves(waves);
	const index = displayedWaves.findIndex((wave) => wave.id === id);
	const target = index + step;
	if (index === -1 || target < 0 || target >= displayedWaves.length) return null;
	const wave = displayedWaves[index]!;
	const targetWave = displayedWaves[target]!;
	if (wave.state !== targetWave.state) return null;
	const refs = waves.map((wave) => wave.ref);
	const position = waves.findIndex((entry) => entry.id === wave.id);
	const targetPosition = waves.findIndex((entry) => entry.id === targetWave.id);
	[refs[position], refs[targetPosition]] = [refs[targetPosition]!, refs[position]!];
	return refs;
};

const tickets = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

// The body of the confirm dialog of a wave delete. `members` is every
// ticket of the epic, and `assigned` holds the ids of the tickets with an
// open agent run. A wave delete stops no agent run, so the dialog names
// the runs only to say that.
export const deleteWords = (
	wave: WaveSummary,
	members: readonly TicketSummary[],
	assigned: ReadonlySet<string>,
): string => {
	const held = members.filter((ticket) => ticket.wave?.id === wave.id);
	const running = held.filter((ticket) => assigned.has(ticket.id)).length;
	const words = [`The ${tickets(wave.counts.total)} of the wave stay in the epic and move to No wave.`];
	if (running > 0) {
		words.push(
			`${formatCount(running)} of them ${running === 1 ? "has" : "have"} an open agent run. A delete stops no agent.`,
		);
	}
	return words.join(" ");
};
