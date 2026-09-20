export const headlineVerbs = new Set(
	(
		"add allow answer apply bind build cap change check clean close configure connect create delete detect disable display " +
		"document draw enable enforce expose fetch filter fix forward give group handle hide hold import keep limit link list load " +
		"make mark match measure merge move name open parse persist prevent print put read record refuse remove rename render " +
		"replace report require resolve restore return reuse run save send set show simplify sort split stack start stop store " +
		"support take track update use validate verify wait warn write"
	).split(" "),
);

const headlineNonVerbs = new Set(
	(
		"a about above after against along among an around at before behind below beneath beside between beyond by despite down " +
		"during epic except for from he her him i in inside into it me near of off on onto out outside over page past person pull " +
		"request review row she since than that the their them these they this those through throughout ticket to toward under " +
		"until up upon us user wave we which who with within without you agent check run"
	).split(" "),
);

export const headlineStartsWithVerb = (word: string) =>
	headlineVerbs.has(word) || !(headlineNonVerbs.has(word) || word.endsWith("ing") || word.endsWith("ed"));

export const clusterBreaks = new Set([
	...(
		"a an and are as at be been both but by for from has have in into is it its no not now of on or that the their then " +
		"this to was were with changes gave gives holds keeps leaves posts reads says takes"
	).split(" "),
	...headlineVerbs,
]);

export const clusterVerbs = new Set(
	[...headlineVerbs].flatMap((verb) => {
		if (/[^aeiou]y$/.test(verb)) return [verb, `${verb.slice(0, -1)}ies`];
		return [verb, `${verb}${/(?:s|x|z|ch|sh|o)$/.test(verb) ? "es" : "s"}`];
	}),
);
