import { z } from "zod";
import { InternalLinkSchema } from "../internalLink";

export const InternalLinkResolveInputSchema = z.strictObject({ link: InternalLinkSchema });
export type InternalLinkResolveInput = z.infer<typeof InternalLinkResolveInputSchema>;

export const InternalLinkResolveOutputSchema = z.strictObject({ href: z.string().startsWith("/") });
export type InternalLinkResolveOutput = z.infer<typeof InternalLinkResolveOutputSchema>;
