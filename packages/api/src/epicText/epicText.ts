import type { EpicCounts } from "../schemas/epicCounts.ts";
import type { WaveSummary } from "../schemas/wave.ts";
import { factSeparator, groupSeparator } from "./separators.ts";

// The top of the epic page in the words a terminal prints. The page draws a
// bar, a color and a link for these facts; a terminal has none of them, so
// every fact here is a word or a number. Screen 1 of
// `docs/research/trellis-for-one-human-and-many-agents.md` holds the page.
// The band is the block at the top of that page: how many tickets the epic
// holds in each status, and what the person can do next.
//
// The page prints one count that a terminal cannot reach: how many agents
// work right now. `epics.get` answers with the tickets and the pull requests
// of the epic and with no run, so `epicCountLine` leaves that count out.
//
// The web app builds the same words from the same fields, in
// `apps/web/src/features/epics/epicBar/epicBar.ts` (`epicProgress` and
// `epicSegments`) and `apps/web/src/features/epics/epicNext/epicNext.ts`
// (`epicNext`). A new status category must reach both sides.

// The done tickets over the tickets that count, "3 of 9". A canceled ticket
// is never done and never in the total.
const doneOfTotal = (counts: EpicCounts): string => `${counts.done} of ${counts.total - counts.canceled}`;

// The statuses the bar stacks, in its order. A status that counts zero keeps
// its word, so the reader sees "started 0".
const bandStatuses = ["done", "review", "started", "todo", "canceled"] as const;

// The tickets of the epic: how many are done, then each status with its
// count.
export const epicBandLine = (counts: EpicCounts): string =>
	[`${doneOfTotal(counts)} done`, ...bandStatuses.map((status) => `${status} ${counts[status]}`)].join(factSeparator);

// What the person can do in the wave the epic works in now. `toStart`
// counts the Todo tickets that no other ticket holds back. `waitsForYou`
// counts the tickets whose turn is the person.
export const epicCountLine = (wave: Pick<WaveSummary, "toStart" | "waitsForYou">): string =>
	[`${wave.toStart} to start`, `${wave.waitsForYou} ${wave.waitsForYou === 1 ? "waits" : "wait"} for you`].join(
		factSeparator,
	);

// The counts beside a wave name. A wave that waits for nobody
// prints the done count alone.
const waveCounts = (wave: Pick<WaveSummary, "counts" | "waitsForYou">): string =>
	wave.waitsForYou === 0
		? doneOfTotal(wave.counts)
		: `${doneOfTotal(wave.counts)}${factSeparator}${wave.waitsForYou} for you`;

// The heading of one wave group. The page marks the wave the epic
// works in now with a badge, and a terminal with the word `current`.
export const epicWaveHeading = (
	wave: Pick<WaveSummary, "counts" | "name" | "ref" | "waitsForYou">,
	current: boolean,
): string => [`${wave.name} (${wave.ref})`, ...(current ? ["current"] : []), waveCounts(wave)].join(groupSeparator);
