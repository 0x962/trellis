import { useState } from "react";

// The subject a sheet draws while it slides out. A sheet closes when its
// subject becomes null, and the panel needs its content until the slide
// ends, so this keeps the last subject. The answer is null only before the
// sheet opens the first time.
export function useShown<T>(subject: T | null): T | null {
	const [shown, setShown] = useState(subject);
	if (subject !== null && subject !== shown) setShown(subject);
	return shown;
}
