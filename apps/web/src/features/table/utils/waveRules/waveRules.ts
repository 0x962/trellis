import type { TicketSummary, WaveSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";

// The full wave order after a move of one place: -1 is up, 1 is down.
// Null when the wave is first and moves up, or last and moves down.
export const movedRefs = (waves: readonly WaveSummary[], id: string, step: -1 | 1): string[] | null => {
	const index = waves.findIndex((wave) => wave.id === id);
	const target = index + step;
	if (index === -1 || target < 0 || target >= waves.length) return null;
	const refs = waves.map((wave) => wave.ref);
	const [moved] = refs.splice(index, 1);
	refs.splice(target, 0, moved!);
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
