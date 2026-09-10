// The letters of the name, upper-case, with everything else dropped.
const letters = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

const maxLength = 5;

// A key for a new root project: the first letter of each word, upper-case,
// 2 to 5 characters. One word takes its first two letters. A taken key
// grows by the next letters of the name until it is free; at five letters
// it takes a digit instead.
export const suggestKey = (name: string, taken: readonly string[]): string => {
	const words = name
		.split(/\s+/)
		.map(letters)
		.filter((word) => word !== "");
	const all = letters(name);
	const base = (words.length === 1 ? all.slice(0, 2) : words.map((word) => word.charAt(0)).join("")).slice(
		0,
		maxLength,
	);
	const isTaken = (key: string) => taken.includes(key);
	let key = base;
	let next = words.length === 1 ? 2 : 1;
	while (isTaken(key) && key.length < maxLength && next < all.length) {
		key = `${key}${all.charAt(next)}`;
		next += 1;
	}
	for (let digit = 2; isTaken(key) && digit < 10; digit += 1) {
		key = `${base.slice(0, maxLength - 1)}${digit}`;
	}
	return key;
};
