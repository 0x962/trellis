import { localDay } from "@trellis/api";

// The instant a message carries, and the identifier the log draws it under.
type Dated = { id: string; createdAt: string };

// Where one day of the log ends and the next starts, in the zone of the
// reader. A message whose local day differs from the message above it starts
// a day, and the chat log draws a dated rule before it. The first message of
// the log always starts a day, because no message sits above it.
//
// The zone decides this, not the stored instant: two messages one hour apart
// in UTC fall on two days for a reader west of Greenwich and on one day for a
// reader east of it. A test names the locale and the zone, so its expected
// days do not depend on the machine that runs it.
export const dayRules = <T extends Dated>(items: T[], request: { locale?: string; timeZone?: string } = {}) => {
	let previousDay: string | null = null;
	return items.map((item) => {
		const day = localDay(item.createdAt, request);
		const startsDay = day !== previousDay;
		previousDay = day;
		return { item, day, startsDay };
	});
};
