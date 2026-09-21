// The name the browser sheet shows for the page it holds. Chromium sends
// the title of a page after the page loads, so the host of the address
// stands in for it until then.
export const browserTitle = (title: string, url: string) => (title === "" ? browserHost(url) : title);

export const browserHost = (url: string) => (URL.canParse(url) ? new URL(url).host : url);
