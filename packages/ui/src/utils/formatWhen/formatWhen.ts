// A moment as "Sep 16, 10:27 AM". It drops the year and the seconds,
// because every moment that trellis prints beside a figure happened in the
// last few weeks, and a reader compares the day and the hour. The Usage
// page prints the last turn of a session, the time a quota was read and
// the time a quota window resets, and all three take this form.
export const formatWhen = (iso: string) =>
	new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
