import { error, json } from '@sveltejs/kit';
import { parseBoardName } from '$lib/moodboard';
import { createBoard, listBoards } from '$lib/server/moodboard-service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await listBoards());

export const POST: RequestHandler = async ({ request }) => {
	let name: string;
	try {
		name = parseBoardName((await request.json())?.name);
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Invalid board name.');
	}
	return json(await createBoard(name), { status: 201 });
};
