import { error, json } from '@sveltejs/kit';
import { isUuid, parseBoardSave, type BoardSave } from '$lib/moodboard';
import { deleteBoard, getBoard, saveBoard } from '$lib/server/moodboard-service';
import type { RequestHandler } from './$types';

const boardId = (id: string) => {
	if (!isUuid(id)) error(404, 'Board not found.');
	return id;
};

export const GET: RequestHandler = async ({ params }) =>
	json(await getBoard(boardId(params.id)), { headers: { 'cache-control': 'no-store' } });

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = boardId(params.id);
	let input: BoardSave;
	try {
		input = parseBoardSave(await request.json());
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Invalid board.');
	}
	return json(await saveBoard(id, input));
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteBoard(boardId(params.id));
	return new Response(null, { status: 204 });
};
