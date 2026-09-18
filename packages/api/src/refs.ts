import { z } from "zod";
import { type ActorKind, type StatusCategory, StatusCategorySchema } from "./schemas/enums.ts";
import { keyPattern, reservedSlugs, slugPattern, ulidPattern } from "./schemas/primitives.ts";

// A ref is how a client names a row without its ULID. Every grammar is
// case-insensitive on input. `canonicalize` returns the one spelling the
// server, the web URL, and the CLI print: keys and ULIDs upper-case, slugs
// and status names lower-case.

export type TicketRef = { kind: "ulid"; id: string } | { kind: "identifier"; key: string; number: number };

export type ProjectRef = { kind: "ulid"; id: string } | { kind: "identifier"; key: string; slugs: string[] };

// An epic ref joins the root key and the epic slug with a slash, so it never
// reads as a project ref, which joins its segments with dots.
export type EpicRef = { kind: "ulid"; id: string } | { kind: "identifier"; key: string; slug: string };

export type StatusRef =
	| { kind: "ulid"; id: string }
	| { kind: "category"; category: StatusCategory }
	| { kind: "identifier"; value: string };

export type ActorHeader = { kind: ActorKind; name: string };

const isUlid = (value: string) => ulidPattern.test(value.toUpperCase());

// `parse` returns undefined when the value is outside the grammar. `schema`
// parses a string into the discriminated shape; `canonical` parses the same
// string and returns the canonical spelling, for contract inputs.
const defineRef = <T>(grammar: string, parse: (value: string) => T | undefined, format: (ref: T) => string) => {
	const schema = z.string().transform((value, ctx) => {
		const ref = parse(value);
		if (ref === undefined) {
			ctx.addIssue({ code: "custom", message: grammar });
			return z.NEVER;
		}
		return ref;
	});
	const canonicalize = (value: string) => format(schema.parse(value));
	return {
		schema: Object.assign(schema, { canonicalize }),
		canonical: Object.assign(schema.transform(format).describe(grammar), { canonicalize }),
	};
};

// A ticket number has at most 10 digits. Every 10-digit number is below
// 2^53, so `Number` keeps each digit and the canonical spelling round-trips.
const ticketIdentifierPattern = /^([A-Z][A-Z0-9]{1,9})-([1-9][0-9]{0,9})$/i;

const parseTicketRef = (value: string): TicketRef | undefined => {
	if (isUlid(value)) return { kind: "ulid", id: value.toUpperCase() };
	const match = ticketIdentifierPattern.exec(value);
	if (match === null) return undefined;
	return { kind: "identifier", key: match[1]!.toUpperCase(), number: Number(match[2]) };
};

const formatTicketRef = (ref: TicketRef) => (ref.kind === "ulid" ? ref.id : `${ref.key}-${ref.number}`);

const ticketRef = defineRef(
	"Expected a ticket ref: a ULID or KEY-n, for example CDE-42.",
	parseTicketRef,
	formatTicketRef,
);

const parseProjectRef = (value: string): ProjectRef | undefined => {
	if (isUlid(value)) return { kind: "ulid", id: value.toUpperCase() };
	const segments = value.split(".");
	const key = segments[0]!.toUpperCase();
	if (!keyPattern.test(key)) return undefined;
	const slugs = segments.slice(1).map((slug) => slug.toLowerCase());
	if (!slugs.every((slug) => slugPattern.test(slug) && !reservedSlugs.has(slug))) return undefined;
	return { kind: "identifier", key, slugs };
};

const formatProjectRef = (ref: ProjectRef) => (ref.kind === "ulid" ? ref.id : [ref.key, ...ref.slugs].join("."));

const projectRef = defineRef(
	"Expected a project ref: a ULID, a KEY, or KEY.slug.slug, for example CDE.web.auth.",
	parseProjectRef,
	formatProjectRef,
);

const epicIdentifierPattern = /^([A-Z][A-Z0-9]{1,9})\/([A-Z0-9]+(?:-[A-Z0-9]+)*)$/i;

const parseEpicRef = (value: string): EpicRef | undefined => {
	if (isUlid(value)) return { kind: "ulid", id: value.toUpperCase() };
	const match = epicIdentifierPattern.exec(value);
	if (match === null) return undefined;
	return { kind: "identifier", key: match[1]!.toUpperCase(), slug: match[2]!.toLowerCase() };
};

const formatEpicRef = (ref: EpicRef) => (ref.kind === "ulid" ? ref.id : `${ref.key}/${ref.slug}`);

const epicRef = defineRef(
	"Expected an epic ref: a ULID or KEY/slug, for example OP/routine-runtime.",
	parseEpicRef,
	formatEpicRef,
);

// A status name is 1 to 40 characters. The colon is reserved for the
// `category:` form, so a name never contains one.
const parseStatusRef = (value: string): StatusRef | undefined => {
	if (isUlid(value)) return { kind: "ulid", id: value.toUpperCase() };
	const colon = value.indexOf(":");
	if (colon >= 0) {
		if (value.slice(0, colon).toLowerCase() !== "category") return undefined;
		const category = StatusCategorySchema.safeParse(value.slice(colon + 1).toLowerCase());
		if (!category.success) return undefined;
		return { kind: "category", category: category.data };
	}
	if (value.length < 1 || value.length > 40) return undefined;
	return { kind: "identifier", value };
};

const formatStatusRef = (ref: StatusRef) => {
	if (ref.kind === "ulid") return ref.id;
	if (ref.kind === "category") return `category:${ref.category}`;
	return ref.value.toLowerCase();
};

const statusRef = defineRef(
	"Expected a status ref: a ULID, a slug, a name, or category:<todo|started|review|done|canceled>.",
	parseStatusRef,
	formatStatusRef,
);

// The name is printable ASCII (0x20 to 0x7E) without the colon, 1 to 64 chars.
const actorHeaderPattern = /^(human|agent):([\x20-\x39\x3B-\x7E]{1,64})$/;

const parseActorHeader = (value: string): ActorHeader | undefined => {
	const match = actorHeaderPattern.exec(value);
	if (match === null) return undefined;
	return { kind: match[1] as ActorKind, name: match[2]! };
};

const formatActorHeader = (actor: ActorHeader) => `${actor.kind}:${actor.name}`;

export const actorHeaderGrammar =
	"Expected x-trellis-actor: <human|agent>:<name>, the name 1 to 64 printable ASCII characters without a colon.";

const actorHeader = defineRef(actorHeaderGrammar, parseActorHeader, formatActorHeader);

export const TicketRefSchema = ticketRef.schema;
export const ProjectRefSchema = projectRef.schema;
export const EpicRefSchema = epicRef.schema;
export const StatusRefSchema = statusRef.schema;
export const ActorHeaderSchema = actorHeader.schema;

// The string forms for contract inputs: a valid ref in, its canonical
// spelling out. The server resolves the canonical string with the schemas above.
export const TicketRefStringSchema = ticketRef.canonical;
export const ProjectRefStringSchema = projectRef.canonical;
export const EpicRefStringSchema = epicRef.canonical;
export const StatusRefStringSchema = statusRef.canonical;
export const ActorHeaderStringSchema = actorHeader.canonical;
