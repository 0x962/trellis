import { useEffect, useState } from "react";

const sources = [
	{ endpoint: "https://dog.ceo/api/breeds/image/random", field: "message" },
	{ endpoint: "https://cataas.com/cat?json=true", field: "url" },
	{ endpoint: "https://randomfox.ca/floof/", field: "image" },
] as const;

export function AnimalPoster() {
	const [image, setImage] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		const source = sources[Math.floor(Math.random() * sources.length)]!;
		async function load() {
			try {
				const response = await fetch(source.endpoint, {
					signal: controller.signal,
					cache: "no-store",
					referrerPolicy: "no-referrer",
				});
				if (!response.ok) return;
				const result = await response.json();
				const url = result[source.field];
				if (typeof url === "string" && url.startsWith("https://") && !controller.signal.aborted) {
					setImage(url);
				}
			} catch {
				// A photo service failure leaves the error page controls available.
			}
		}
		void load();
		return () => controller.abort();
	}, []);

	return (
		<div aria-hidden="true" className="mb-4 aspect-[192/306] w-24 shrink-0">
			{image && (
				<img
					src={image}
					alt=""
					width={192}
					height={306}
					referrerPolicy="no-referrer"
					onError={() => setImage(null)}
					className="aspect-[192/306] w-full -rotate-2 rounded-sm object-cover shadow-md grayscale"
				/>
			)}
		</div>
	);
}
