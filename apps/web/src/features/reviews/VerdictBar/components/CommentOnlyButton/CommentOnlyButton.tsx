import { useMutation } from "@tanstack/react-query";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { draftCount } from "../../sendBackText/sendBackText";
import { DraftNote } from "../DraftNote";

export type CommentOnlyButtonProps = {
	pr: string;
	// The commit the review sits on. `reviews.submit` refuses a thread that
	// sits on another commit.
	headSha: string;
	// The threads that leave with the click.
	drafts: readonly string[];
	onDone: () => void;
};

// `Comment only` posts the drafts and stops there. It moves no ticket, it
// reaches no agent, and it merges nothing, so a person can leave a review
// that asks for no next step.
export function CommentOnlyButton({ pr, headSha, drafts, onDone }: CommentOnlyButtonProps) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const close = () => {
		setOpen(false);
		setNote("");
		comment.reset();
	};
	const comment = useMutation({
		mutationFn: () => client.reviews.submit({ pr, headSha, verdict: "comment", body: note, threadIds: [...drafts] }),
		onSuccess: () => {
			close();
			toast.success("The review is a comment", {
				description: `GitHub has the note and ${draftCount(drafts.length)}.`,
			});
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onDone();
		},
	});
	return (
		<>
			<Button onClick={() => setOpen(true)}>Comment only</Button>
			<DraftNote
				open={open}
				title="Comment only"
				description="The note and the drafts go to GitHub. Nothing else changes."
				confirmLabel="Comment"
				note={note}
				error={comment.error?.message ?? null}
				processing={comment.isPending}
				onNote={setNote}
				onConfirm={() => comment.mutate()}
				onCancel={close}
			/>
		</>
	);
}
