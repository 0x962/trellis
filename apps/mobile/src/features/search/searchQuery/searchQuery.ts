// The rows one search asks for.
export const searchLimit = 20;

// The canonical identifier a query names, or null when the query is not one
// complete identifier. A person who types CDE-42 reaches that ticket; every
// other query is a text search.
export const identifierOf = (_query: string): string | null => {
	throw new Error("identifierOf is not built yet.");
};

// True when a query holds a character the server can search for.
export const isSearchable = (_query: string): boolean => {
	throw new Error("isSearchable is not built yet.");
};
