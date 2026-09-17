export type LocalTimeOptions = { locale?: string; timeZone?: string };
const formatters = new Map<string, Intl.DateTimeFormat>();

export const localDateTime = (iso: string, options: LocalTimeOptions = {}) => {
	const key = `${options.locale ?? ""}\0${options.timeZone ?? ""}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat(options.locale, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZoneName: "short",
			...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
		});
		formatters.set(key, formatter);
	}
	return formatter.format(new Date(iso));
};
