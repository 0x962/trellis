export function pageShareVersionText(requestedVersion: number, latestVersion: number) {
	return requestedVersion === latestVersion
		? "This link opens the current version of the Page."
		: `This link opens the current version of the Page, not version ${requestedVersion}.`;
}
