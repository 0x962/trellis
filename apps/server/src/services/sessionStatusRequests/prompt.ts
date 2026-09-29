export const sessionStatusRequestPrompt = (
	sessionId: string,
	requestId: string,
) => `Provide a status update for this session.

Explain the purpose, actions, findings, uncertainty, and next step in useful prose. Use Markdown. You can include optional HTML files as embeds.

Save the Markdown reply with this exact command:

trellis session status write ${sessionId} --request-id ${requestId} --body -

Pass the Markdown body on standard input. To attach HTML files, use this form:

trellis session status write ${sessionId} --request-id ${requestId} --body - --embed report.html,details.html

Use one --embed flag with a comma-separated path list. Do not send the answer as chat text alone. A sent request is not a saved update. After the write succeeds, continue the assigned work.`;
