// The one formatter, built once. `Intl.DateTimeFormat` costs about 22 us to
// build and 1.5 us to reuse, and a table of 100 rows calls this per row on
// every draw.
//
// The locale is fixed to en-US because the figures beside these moments are
// fixed too: `formatUsd` prints US dollars and `formatDayLabel` prints
// "Sep 12", both with the same locale.
const dayTime = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

// A moment as "Sep 16, 10:27 AM". It drops the year and the seconds,
// because a reader compares the day and the hour of two recent moments.
export const formatDayTime = (iso: string) => dayTime.format(new Date(iso));
