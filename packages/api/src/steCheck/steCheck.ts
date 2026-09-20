import { unquotedText } from "./quoted";
import { clusterBreaks, clusterVerbs, headlineStartsWithVerb } from "./words";

export type SteCheckResult = { refusals: string[]; warnings: string[] };

type Sentence = { masked: string; number: number };

const wordPattern = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const words = (text: string) => text.match(wordPattern) ?? [];

const sentences = (masked: string): Sentence[] => {
	const result: Sentence[] = [];
	let start = 0;
	for (let index = 0; index <= masked.length; index += 1) {
		if (index < masked.length && !".!?\n".includes(masked[index]!)) continue;
		const value = masked.slice(start, index + 1);
		if (words(value).length > 0 || value.includes("—")) {
			result.push({ masked: value, number: result.length + 1 });
		}
		start = index + 1;
	}
	return result;
};

const nounCluster = (sentence: string) => {
	let cluster: string[] = [];
	let end = 0;
	for (const match of sentence.matchAll(wordPattern)) {
		if (/[,;:()[\]{}—]/.test(sentence.slice(end, match.index))) {
			if (cluster.length > 3) return cluster;
			cluster = [];
		}
		const word = match[0];
		const lower = word.toLowerCase();
		if (clusterBreaks.has(lower) || clusterVerbs.has(lower) || lower.endsWith("ed") || lower.endsWith("ly")) {
			if (cluster.length > 3) return cluster;
			cluster = [];
		} else cluster.push(word);
		end = match.index + word.length;
	}
	return cluster.length > 3 ? cluster : undefined;
};

const passive = (sentence: string) =>
	/\b(?:am|are|is|was|were|be|been|being)\s+(?:\p{L}+ly\s+)?(?:\p{L}+(?:ed|en)|built|done|drawn|given|held|kept|known|made|read|sent|shown|stored|taken|written)(?:\s+by)?\b/iu.exec(
		sentence,
	)?.[0];

const gerund = (sentence: string) => {
	const pattern = /\b\p{L}+ing\b/giu;
	for (const match of sentence.matchAll(pattern)) {
		const before = words(sentence.slice(0, match.index)).at(-1)?.toLowerCase();
		const after = words(sentence.slice(match.index + match[0].length))[0]?.toLowerCase();
		if (["a", "an", "the", "my", "our", "their", "your", "by", "for", "of", "with"].includes(before ?? "")) {
			if (after === undefined || ["am", "are", "is", "was", "were"].includes(after)) return match[0];
		}
		if (before === undefined && ["am", "are", "is", "was", "were"].includes(after ?? "")) return match[0];
	}
	return undefined;
};

export function steCheck(text: string, options: { headline: boolean }): SteCheckResult {
	const masked = unquotedText(text);
	const parts = sentences(masked);
	const refusals: string[] = [];
	const warnings: string[] = [];

	if (options.headline) {
		const count = words(masked).length;
		if (count > 12) refusals.push(`headline is ${count} words. The limit is 12.`);
		const first = words(masked)[0]?.toLowerCase();
		if (first !== undefined && !headlineStartsWithVerb(first)) {
			refusals.push("headline does not start with a verb.");
		}
	}

	for (const sentence of parts) {
		if (sentence.masked.includes("—")) {
			refusals.push(`sentence ${sentence.number} holds an em dash. Use a comma, a period or a colon.`);
		}
	}
	if (!options.headline) {
		for (const sentence of parts) {
			const count = words(sentence.masked).length;
			if (count > 25) refusals.push(`sentence ${sentence.number} is ${count} words. The limit is 25.`);
		}
	}
	for (const sentence of parts) {
		const cluster = nounCluster(sentence.masked);
		if (cluster !== undefined) {
			refusals.push(
				`sentence ${sentence.number} holds a noun cluster of ${cluster.length} words: "${cluster.join(" ")}". The limit is 3.`,
			);
		}
	}
	for (const sentence of parts) {
		const passiveForm = passive(sentence.masked);
		if (passiveForm !== undefined) {
			warnings.push(`sentence ${sentence.number} is passive: "${passiveForm}". Name the actor.`);
		}
	}
	for (const sentence of parts) {
		const gerundForm = gerund(sentence.masked);
		if (gerundForm !== undefined) {
			warnings.push(`sentence ${sentence.number} uses "${gerundForm}" as a noun. Use an infinitive.`);
		}
	}

	return { refusals, warnings };
}
