// Every human-facing clock, date, and date-time of the product. The web
// pages, the CLI, and the chat notices of the server read this one module,
// so one instant reads the same way on every surface. Storage, the wire
// schemas, and the JSON of the CLI keep the UTC string and never come here.

// The locale and the zone the caller asks for. Both absent means the locale
// and the zone of the device the reader uses. A test names both, so its
// expected text does not depend on the machine that runs it.
type ZoneRequest = { locale?: string; timeZone?: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

// An Intl.DateTimeFormat costs about 2 ms to build and about 4 us to use,
// and the chat log formats every row of the open channel. The Map holds one
// formatter for each shape, locale, and zone. The `\0` cannot occur in any
// of the three parts, so two different keys never join into one string.
//
// A formatter built with no zone keeps the device zone it was born with. A
// reader who moves the device to another zone would keep the old clock.
// Intl.DateTimeFormat().resolvedOptions().timeZone reads the current device
// zone, but it costs about 72 us, which is 19 times the cost of the format
// call it guards. deviceZoneMark costs about 0.2 us and answers the same
// question for a display: two zones that give the same offset in January
// and in July put every instant of the year on the same clock.
const deviceZoneMark = () => {
	const year = new Date().getFullYear();
	return `${new Date(year, 0, 1).getTimezoneOffset()}/${new Date(year, 6, 1).getTimezoneOffset()}`;
};

const formatterFor = (shape: string, request: ZoneRequest, fields: Intl.DateTimeFormatOptions) => {
	const zone = request.timeZone ?? deviceZoneMark();
	const key = `${shape}\0${request.locale ?? ""}\0${zone}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat(request.locale, {
			...fields,
			...(request.timeZone === undefined ? {} : { timeZone: request.timeZone }),
		});
		formatters.set(key, formatter);
	}
	return formatter;
};

// The clock alone: 08:30:00 in the zone of the reader. A 24 hour clock in
// every locale, so a column of clocks keeps one width.
export const localClock = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("clock", request, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).format(new Date(iso));

// The calendar day of an instant in the zone of the reader: 2025-12-31. The
// chat log compares this text between two messages to find where one day
// ends and the next starts.
export const localDay = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("day", request, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// The month and the day alone: Jul 31. A relative time falls back to this
// once the instant is too old for "3d ago" to tell a reader anything.
export const shortDay = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("short-day", request, { month: "short", day: "numeric" }).format(new Date(iso));

// One line of text, wide enough for a table cell or a chat notice:
// Dec 31, 2025 at 08:30:00 PM EST. The zone label names the zone the clock
// uses, because the reader of a CLI table or a chat notice can run on
// another host than the writer.
export const shortZonedDateTime = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("short-zoned", request, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	}).format(new Date(iso));

// The weekday, the full date, the seconds, and the zone label:
// Wednesday, December 31, 2025 at 8:30:00 PM EST. This is the `title` a
// reader opens to learn the day and the zone behind a clock or a relative
// time.
export const fullZonedDateTime = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("full-zoned", request, { dateStyle: "full", timeStyle: "long" }).format(new Date(iso));
