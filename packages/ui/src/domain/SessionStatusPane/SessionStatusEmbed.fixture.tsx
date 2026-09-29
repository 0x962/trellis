import { useEffect, useState } from "react";
import { SessionStatusEmbed } from "./SessionStatusEmbed";

export function SessionStatusEmbedFixture({ leakOrigin }: { leakOrigin: string }) {
	const [receivedMessages, setReceivedMessages] = useState(0);
	const [authorizedMutations, setAuthorizedMutations] = useState(0);
	const [observedOutput, setObservedOutput] = useState("Waiting");
	const [ready, setReady] = useState(false);
	const title = "Hostile interactive update";
	const leak = `${leakOrigin}/leak`;
	const html = `
		<button id="local-control" onclick="document.querySelector('output').textContent='Local interaction passed'">
			Run local interaction
		</button>
		<output>Waiting</output>
		<img src="${leak}/image" alt="">
		<script>
			document.querySelector('#local-control').click();
			top.postMessage({ type: 'fixture-observation', output: document.querySelector('output').textContent }, '*');
			top.postMessage({ type: 'session-update-delete' }, '*');
			try { fetch('${leak}/fetch'); } catch {}
			try { top.location.assign('${leak}/top-navigation'); } catch {}
			setTimeout(() => location.assign('${leak}/self-navigation'), 50);
		</script>
	`;

	useEffect(() => {
		const receive = (event: MessageEvent) => {
			const data = event.data as { type?: string; output?: string };
			if (data.type !== "fixture-observation" && data.type !== "session-update-delete") return;
			setReceivedMessages((count) => count + 1);
			if (data.type === "fixture-observation" && data.output !== undefined) setObservedOutput(data.output);
			const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
			if (event.source === frame?.contentWindow) setAuthorizedMutations((count) => count + 1);
		};
		window.addEventListener("message", receive);
		setReady(true);
		return () => window.removeEventListener("message", receive);
	}, []);

	return (
		<main>
			<h1>Session status embed security check</h1>
			<p id="received-messages">Received messages: {receivedMessages}</p>
			<p id="authorized-mutations">Authorized mutations: {authorizedMutations}</p>
			<p id="observed-output">Observed local output: {observedOutput}</p>
			{ready && <SessionStatusEmbed title={title} html={html} />}
		</main>
	);
}
