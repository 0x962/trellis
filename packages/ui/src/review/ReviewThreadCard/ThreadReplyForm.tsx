import { ArrowCounterClockwise, ArrowUp, Check } from "@phosphor-icons/react";
import { type RefObject, useRef } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { commentKeySubmits } from "../commentSubmitKey";

type Props = {
	reply: string;
	setReply: (body: string) => void;
	// True while a reply, an edit, a delete or a reaction of this card waits
	// for the server.
	busy: boolean;
	// True while the resolve call of this card waits for the server. It stops
	// the resolve control alone.
	resolving: boolean;
	resolved: boolean;
	readOnly: boolean;
	submitOnEnter: boolean;
	onReply: (body: string) => Promise<unknown>;
	// Sends one call and writes its failure into the card.
	run: (action: () => Promise<unknown>) => Promise<void>;
	toggleResolved: () => void;
	// The card puts the focus back on this control when the card opens again.
	resolveRef: RefObject<HTMLButtonElement | null>;
};

export function ThreadReplyForm({
	reply,
	setReply,
	busy,
	resolving,
	resolved,
	readOnly,
	submitOnEnter,
	onReply,
	run,
	toggleResolved,
	resolveRef,
}: Props) {
	const replyInput = useRef<HTMLTextAreaElement>(null);
	const resolveLabel = resolved ? "Reopen comment" : "Resolve comment";
	return (
		<form
			className="review-reply"
			onSubmit={(e) => {
				e.preventDefault();
				void run(async () => {
					await onReply(reply);
					setReply("");
					replyInput.current?.focus({ preventScroll: true });
				});
			}}
		>
			<textarea
				ref={replyInput}
				aria-label="Reply"
				placeholder="Leave a reply…"
				disabled={readOnly}
				value={reply}
				onChange={(e) => setReply(e.target.value)}
				onKeyDown={(e) => {
					if (
						commentKeySubmits(
							{
								key: e.key,
								shiftKey: e.shiftKey,
								metaKey: e.metaKey,
								ctrlKey: e.ctrlKey,
								isComposing: e.nativeEvent.isComposing,
							},
							submitOnEnter,
						) &&
						reply.trim() &&
						!busy &&
						!readOnly
					) {
						e.preventDefault();
						e.currentTarget.form?.requestSubmit();
					}
				}}
			/>
			<Tooltip content="Post reply">
				<IconButton type="submit" label="Post reply" icon={<ArrowUp />} disabled={readOnly || busy || !reply.trim()} />
			</Tooltip>
			<Tooltip content={resolveLabel}>
				<IconButton
					ref={resolveRef}
					label={resolveLabel}
					icon={resolved ? <ArrowCounterClockwise /> : <Check />}
					disabled={readOnly || resolving}
					// The button stays in the tab order while the call is out, so focus stays on it.
					focusableWhenDisabled
					onClick={toggleResolved}
				/>
			</Tooltip>
		</form>
	);
}
