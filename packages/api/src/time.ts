// Every human-facing clock, date, and date-time of the product. The web pages
// and the CLI read this module, so one instant reads the same way on every
// surface. Storage, wire schemas, and CLI JSON keep the UTC string.

// The locale and the zone the caller asks for. Both absent means the locale
// and the zone of the device the reader uses. A test names both, so its
// expected text does not depend on the machine that runs it.
type ZoneRequest = { locale?: string; timeZone?: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

// Intl.DateTimeFormat captures the default locale and zone when it starts.
// formatterFor resolves both defaults before each cache lookup, so an open
// app follows a device change. The Map holds one formatter for each shape,
// locale, and IANA zone. The `\0` cannot occur in those three parts.
const formatterFor = (shape: string, request: ZoneRequest, fields: Intl.DateTimeFormatOptions) => {
	const defaults = new Intl.DateTimeFormat().resolvedOptions();
	const locale = request.locale ?? defaults.locale;
	const timeZone = request.timeZone ?? defaults.timeZone;
	const key = `${shape}\0${locale}\0${timeZone}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat(locale, {
			...fields,
			timeZone,
		});
		formatters.set(key, formatter);
	}
	return formatter;
};

// The month and the day alone: Jul 31. A relative time falls back to this
// once the instant is too old for "3d ago" to tell a reader anything.
export const shortDay = (iso: string, request: ZoneRequest = {}) =>
	formatterFor("short-day", request, { month: "short", day: "numeric" }).format(new Date(iso));

// One line of text for a table cell: Dec 31, 2025 at 08:30:00 PM EST. The zone
// label names the clock zone because the CLI can run on another host.
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
