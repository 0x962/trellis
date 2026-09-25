import { z } from "zod";
import { ulidPattern } from "../schemas/primitives.ts";

export const internalLinkTypes = ["page", "pr", "ticket", "resource", "epic", "session"] as const;
export const InternalLinkTypeSchema = z.enum(internalLinkTypes);
export type InternalLinkType = z.infer<typeof InternalLinkTypeSchema>;

const typePattern = internalLinkTypes.join("|");
const linkPattern = new RegExp(`^trellis://(${typePattern})/(${ulidPattern.source.slice(1, -1)})$`);

export type InternalLink = { type: InternalLinkType; id: string };

// A Trellis record link holds one known record type and one upper-case ULID.
// It has no query, fragment, credentials, or mutable record name.
export const parseInternalLink = (value: string): InternalLink | null => {
	const match = linkPattern.exec(value);
	if (match === null) return null;
	return { type: match[1] as InternalLinkType, id: match[2]! };
};

export const InternalLinkSchema = z.string().refine((value) => parseInternalLink(value) !== null, {
	message: "Expected trellis://<type>/<ULID> with a supported record type.",
});

export const internalLink = (type: InternalLinkType, id: string): string =>
	InternalLinkSchema.parse(`trellis://${type}/${id}`);
