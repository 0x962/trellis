import { parse } from "chrono-node/en";

type SnoozeResult = { date: Date | null; error: string | null };
const units = "minutes?|mins?|mnths?|months?|hours?|hrs?|days?|weeks?|years?|yrs?|[mhdwy]";
const duration = new RegExp(`(?:(\\d+)\\s*(${units})|(${units})\\s*(\\d+))`, "gi");
const addMonths = (date: Date, count: number) => {
	const day = date.getDate();
	date.setDate(1);
	date.setMonth(date.getMonth() + count);
	const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
	date.setDate(Math.min(day, end));
};
const morning = (date: Date) => {
	date.setHours(9, 0, 0, 0);
	return date;
};

export const parseSnooze = (input: string, now = new Date()): SnoozeResult => {
	const text = input.trim().toLowerCase();
	let date: Date | null = null;
	const matches = [...text.matchAll(duration)];
	if (matches.length > 0 && text.replace(duration, "").trim() === "") {
		date = new Date(now);
		for (const match of matches) {
			const count = Number(match[1] ?? match[4]);
			const unit = (match[2] ?? match[3])!;
			if (unit.startsWith("month") || unit.startsWith("mnth") || (unit === "m" && match[3])) addMonths(date, count);
			else if (unit.startsWith("y")) addMonths(date, count * 12);
			else if (unit.startsWith("w")) date.setDate(date.getDate() + count * 7);
			else if (unit.startsWith("d")) date.setDate(date.getDate() + count);
			else date = new Date(date.getTime() + count * (unit.startsWith("h") ? 3600000 : 60000));
		}
	} else if (text === "today") {
		date = new Date(now);
		date.setHours(23, 59, 0, 0);
	} else if (text === "tomorrow" || text === "yesterday") {
		date = morning(new Date(now));
		date.setDate(date.getDate() + (text === "tomorrow" ? 1 : -1));
	} else if (text === "next week") {
		date = morning(new Date(now));
		date.setDate(date.getDate() + (8 - (date.getDay() || 7)));
	} else {
		const results = parse(text, now, { forwardDate: true });
		const result = results[0];
		if (results.length === 1 && result && !result.end && result.index === 0 && result.text.length === text.length)
			date = result.start.date();
	}
	if (date === null || !Number.isFinite(date.getTime()) || date.getFullYear() > 9999)
		return { date: null, error: "Enter a duration or date, such as 1d, tomorrow, or October 5 at 3pm." };
	if (date <= now) return { date, error: "Choose a future time." };
	return { date, error: null };
};
