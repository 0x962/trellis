import { useEffect, useState } from "react";
import raccoon from "../../poster.jpg";
import fox from "./fox.jpg";
import otter from "./otter.jpg";
import owl from "./owl.jpg";

const animals = [raccoon, fox, otter, owl];
let previous: string | undefined;

export function AnimalPoster() {
	const [picture] = useState(() => {
		const choices = animals.filter((animal) => animal !== previous);
		return choices[Math.floor(Math.random() * choices.length)]!;
	});
	useEffect(() => {
		previous = picture;
	}, [picture]);
	return (
		<img
			src={picture}
			alt=""
			width={192}
			height={306}
			className="mb-4 aspect-[192/306] w-24 -rotate-2 rounded-sm shadow-md grayscale"
		/>
	);
}
