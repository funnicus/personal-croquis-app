export const getResponseErrorMessage = async (response: Response, fallback: string) => {
	try {
		if (response.headers.get('content-type')?.includes('application/json')) {
			const body = (await response.json()) as { error?: unknown; message?: unknown };
			if (typeof body.error === 'string' && body.error.trim()) return body.error;
			if (typeof body.message === 'string' && body.message.trim()) return body.message;
		} else {
			const text = await response.text();
			if (text.trim()) return text;
		}
	} catch {
		// Keep the fallback when the response body is not parseable.
	}

	return fallback;
};
