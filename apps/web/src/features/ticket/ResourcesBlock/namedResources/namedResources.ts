import type { Resource, TicketContract } from "@trellis/api";

// The text of a ticket that can name a resource: the ask and the five clauses
// of the contract, in lower case.
export const ticketText = (description: string, contract: TicketContract): string =>
	[description, contract.result, ...contract.files, ...contract.leaveAlone, ...contract.verify, ...contract.reviewFocus]
		.join("\n")
		.toLowerCase();

// The ask of a ticket that builds one step of a design opens with the step:
// `Step 6 of the routine runtime.`. The block prints that step after each
// resource name. The match starts at the first word of the ask, so a sentence
// that writes "do not repeat step 3" in the middle of the ask gives no step.
export const stepOf = (description: string): string | null => {
	const match = /^\s*step (\d+)\b/i.exec(description);
	return match === null ? null : `step ${match[1]}`;
};

// A name that holds a dot or a slash is a path, such as `routine-runtime.md`
// or `docs/routine-runtime.md`. A name without one is a title, such as
// `Routines E2E plan`.
const isPath = /[./]/;

// The characters that end a token of prose: the space, the quote marks, the
// brackets and the sentence marks.
const tokenBreak = /[\s"'`()[\]{}<>,;:]+/;

const namesOf = (text: string): Set<string> => {
	const names = new Set<string>();
	for (const token of text.split(tokenBreak)) {
		const word = token.replace(/[.,;:]+$/, "");
		if (word === "") continue;
		names.add(word);
		names.add(word.slice(word.lastIndexOf("/") + 1));
	}
	return names;
};

// The resources that the ticket names. The name must fill a whole token of the
// ticket text, or the last segment of a path token, so `routine-runtime.md`
// follows a ticket that writes `docs/routine-runtime.md` and not one that
// writes `routine-runtime.md.backup`.
//
// A ticket names a resource by its path alone. A title inside a sentence names
// nothing: a resource called `plan` must not follow every ticket whose contract
// writes "read the plan first".
export const namedResources = (resources: readonly Resource[], text: string): Resource[] => {
	const names = namesOf(text);
	return resources.filter((resource) => {
		const name = resource.name.toLowerCase();
		return isPath.test(name) && names.has(name);
	});
};
