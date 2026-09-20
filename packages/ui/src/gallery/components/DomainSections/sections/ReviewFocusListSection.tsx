import { useState } from "react";
import { ReviewFocusList } from "../../../../review/ReviewFocusList";
import { Section } from "../../Section";

const sentences = [
	"the caller is an internal service identity",
	"the route names no property a caller did not ask about",
];

export function ReviewFocusListSection() {
	const [holdStates, setHoldStates] = useState<boolean[]>(() => sentences.map(() => false));
	return (
		<Section name="ReviewFocusList" note="unheld, held, empty" className="items-stretch">
			<div className="min-w-64 flex-1">
				<ReviewFocusList
					sentences={sentences}
					held={holdStates}
					onToggle={(index, checked) => setHoldStates((current) => current.with(index, checked))}
				/>
			</div>
			<div className="min-w-64 flex-1">
				<ReviewFocusList sentences={[]} held={[]} onToggle={() => {}} />
			</div>
		</Section>
	);
}
