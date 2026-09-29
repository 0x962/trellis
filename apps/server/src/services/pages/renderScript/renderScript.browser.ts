export async function probePageAnchorReplacement(script: string) {
	const frame = document.createElement("iframe");
	frame.style.cssText = "width:800px;height:500px";
	const layouts: { thread: string; x: number; y: number }[][] = [];
	const receive = (event: MessageEvent) => {
		if (event.source === frame.contentWindow && event.data?.type === "page-comment-layout")
			layouts.push(event.data.items);
	};
	window.addEventListener("message", receive);
	const waitFor = async (check: () => boolean, message: string) => {
		for (let attempt = 0; attempt < 120; attempt += 1) {
			if (check()) return;
			await new Promise(requestAnimationFrame);
		}
		throw new Error(message);
	};
	const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
	frame.srcdoc = `<!doctype html><html><body style="height:3000px;margin:0">
<p id="anchor" style="position:absolute;top:20px;margin:0;height:28px">Original</p>
<p id="text" style="position:absolute;top:80px;margin:0">needle</p>
<p id="stable" style="position:absolute;top:120px;margin:0">Stable</p>
${script}</body></html>`;
	document.body.append(frame);
	try {
		await loaded;
		const content = frame.contentWindow!;
		const doc = frame.contentDocument!;
		const original = doc.querySelector<HTMLElement>("#anchor")!;
		const text = doc.querySelector<HTMLElement>("#text")!;
		const query = doc.querySelector.bind(doc);
		const createWalker = doc.createTreeWalker.bind(doc);
		const rangeResolutions: string[] = [];
		doc.createTreeWalker = (root, whatToShow, filter) => {
			rangeResolutions.push((root as HTMLElement).id);
			return createWalker(root, whatToShow, filter);
		};
		let queries = 0;
		doc.querySelector = ((selector: string) => {
			queries += 1;
			return query(selector);
		}) as typeof doc.querySelector;
		const send = (data: object) => content.postMessage({ ...data, nonce: "dom-probe" }, "*");
		send({
			type: "page-comments-state",
			comments: [
				{ thread: "element", anchor: { kind: "element", path: "#anchor" } },
				{ thread: "text", anchor: { kind: "text", path: "#text", quote: "needle", prefix: "", suffix: "" } },
				{ thread: "stable", anchor: { kind: "text", path: "#stable", quote: "Stable", prefix: "", suffix: "" } },
			],
		});
		await waitFor(() => layouts.at(-1)?.length === 3, "Initial pins did not appear");
		const initial = layouts.at(-1)!;
		rangeResolutions.length = 0;
		const replacement = original.cloneNode(true) as HTMLElement;
		replacement.style.top = "160px";
		original.replaceWith(replacement);
		text.replaceChildren(doc.createTextNode("A longer prefix "), doc.createElement("span"));
		text.lastChild!.textContent = "needle";
		const range = doc.createRange();
		range.selectNodeContents(text.lastChild!);
		const expectedText = range.getBoundingClientRect();
		await waitFor(
			() =>
				layouts.at(-1)?.find((pin) => pin.thread === "element")?.y === 174 &&
				layouts.at(-1)?.find((pin) => pin.thread === "text")?.x === expectedText.right,
			"Replacement element and text range did not update",
		);
		const replaced = layouts.at(-1)!;
		if (rangeResolutions.join() !== "text") throw new Error("An unaffected range was resolved again");
		if (original.isConnected) throw new Error("The original node remains connected");
		const reveal = { target: null as HTMLElement | null };
		const farReplacement = replacement.cloneNode(true) as HTMLElement;
		farReplacement.style.top = "1800px";
		const scroll = farReplacement.scrollIntoView;
		farReplacement.scrollIntoView = function () {
			reveal.target = this;
			scroll.call(this, { block: "center", behavior: "instant" });
		};
		replacement.replaceWith(farReplacement);
		content.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				data: { type: "page-comment-reveal", nonce: "dom-probe", thread: "element" },
			}),
		);
		if (reveal.target !== farReplacement) throw new Error("Reveal used the detached node");
		await waitFor(() => content.scrollY > 0, "Reveal did not scroll to the replacement");
		const revealScrollY = content.scrollY;
		farReplacement.remove();
		await waitFor(
			() => layouts.at(-1)?.every((pin) => pin.thread !== "element") === true,
			"The deleted anchor kept a pin",
		);
		doc.body.append(farReplacement);
		await waitFor(
			() => layouts.at(-1)?.some((pin) => pin.thread === "element") === true,
			"The restored anchor lost its pin",
		);
		const beforeScroll = queries;
		const beforeLayout = layouts.length;
		content.dispatchEvent(new Event("scroll"));
		await waitFor(() => layouts.length > beforeLayout, "Scroll did not produce a layout");
		if (queries !== beforeScroll) throw new Error("Scroll resolved anchors again");
		return {
			initial,
			replaced,
			revealScrollY,
			revealUsedReplacement: true,
			restored: true,
			scrollQueries: 0,
			rangeResolutions,
		};
	} finally {
		window.removeEventListener("message", receive);
		frame.remove();
	}
}
