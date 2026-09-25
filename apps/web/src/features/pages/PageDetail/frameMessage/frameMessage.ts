import { PageCommentAnchorSchema } from "@trellis/api";
import { z } from "zod";

const coordinate = z.number().finite().min(0).max(100_000_000);
const layoutItem = z.strictObject({ thread: z.string().min(1), x: coordinate, y: coordinate });
const messageSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("page-ready"), nonce: z.string() }),
	z.strictObject({ type: z.literal("page-scroll"), nonce: z.string(), x: coordinate, y: coordinate }),
	z.strictObject({ type: z.literal("page-link"), nonce: z.string(), href: z.string().max(8192) }),
	z.strictObject({ type: z.literal("page-comment-anchor"), nonce: z.string(), anchor: PageCommentAnchorSchema }),
	z.strictObject({ type: z.literal("page-comment-layout"), nonce: z.string(), items: z.array(layoutItem).max(500) }),
]);

export const readFrameMessage = (
	event: Pick<MessageEvent, "source" | "data">,
	source: Window | null,
	nonce: string,
) => {
	if (source === null || event.source !== source) return null;
	const parsed = messageSchema.safeParse(event.data);
	return parsed.success && parsed.data.nonce === nonce ? parsed.data : null;
};
