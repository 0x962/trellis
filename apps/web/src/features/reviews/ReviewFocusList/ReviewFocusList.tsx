import { ReviewFocusList as ReviewFocusListView } from "@trellis/ui/review";
import { useState } from "react";
import { type HoldMarksStorage, isHeld, loadHoldMarks, setHoldMark } from "./holdMarks/holdMarks";

export type ReviewFocusListProps = {
	pr: string;
	revisionId: string;
	sentences: readonly string[];
	storage?: HoldMarksStorage;
};

export function ReviewFocusList({ pr, revisionId, sentences, storage = localStorage }: ReviewFocusListProps) {
	const [loadedMarks, setLoadedMarks] = useState(() => ({ pr, marks: loadHoldMarks(storage, pr) }));
	if (loadedMarks.pr !== pr) setLoadedMarks({ pr, marks: loadHoldMarks(storage, pr) });
	const marks = loadedMarks.marks;
	const holdStates = sentences.map((sentence, index) => isHeld(marks, sentence, index, revisionId));

	return (
		<ReviewFocusListView
			sentences={sentences}
			held={holdStates}
			onToggle={(index, checked) => {
				const next = setHoldMark(storage, pr, marks, sentences[index]!, index, revisionId, checked);
				setLoadedMarks({ pr, marks: next });
			}}
		/>
	);
}
