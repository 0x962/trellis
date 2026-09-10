// The list a ticket page returns to. A list route stores its own href on
// every render, filters included and without the peek param. The ticket
// page's "Back to list" reads it. The value lives in sessionStorage, so a
// reload keeps it and a new tab starts fresh.
const key = "trellis.last-list";

export const rememberList = (href: string) => {
	sessionStorage.setItem(key, href);
};

export const lastListHref = () => sessionStorage.getItem(key) ?? "/all";
