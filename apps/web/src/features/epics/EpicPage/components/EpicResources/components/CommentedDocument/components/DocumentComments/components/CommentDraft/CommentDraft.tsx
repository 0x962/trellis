import { ArrowUp, X } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { errorMessage } from "../../../../../../../../../../../lib/conflict";
import { QuotedText } from "../QuotedText";

// The first comment of a new thread, on the text the person selected. ⌘Enter
// sends it, and Escape drops it.
export function CommentDraft({
	quote,
	onSend,
	onCancel,
}: {
	quote: string;
	onSend: (body: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const send = async () => {
		setBusy(true);
		setError(null);
		try {
			await onSend(body.trim());
		} catch (cause) {
			setError(errorMessage(cause));
			setBusy(false);
		}
	};
	return (
		<form
			className="review-thread"
			aria-label="New comment"
			onSubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<div className="review-message">
				<QuotedText quote={quote} textRemoved={false} />
			</div>
			<div className="review-reply">
				<textarea
					aria-label="Comment"
					placeholder="Add a comment…"
					// biome-ignore lint/a11y/noAutofocus: the person just pressed Comment
					autoFocus
					value={body}
					onChange={(event) => setBody(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							onCancel();
						}
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim() !== "" && !busy) {
							event.preventDefault();
							event.currentTarget.form!.requestSubmit();
						}
					}}
				/>
				<Tooltip content="Cancel">
					<IconButton label="Cancel" icon={<X />} disabled={busy} onClick={onCancel} />
				</Tooltip>
				<Tooltip content="Comment ⌘↵">
					<IconButton type="submit" label="Comment" icon={<ArrowUp />} disabled={busy || body.trim() === ""} />
				</Tooltip>
			</div>
			{error !== null && (
				<p role="alert" className="review-error">
					{error}
				</p>
			)}
		</form>
	);
}
