import { error } from '@sveltejs/kit';
import { sql } from 'kysely';
import type { Board, BoardSave, BoardSummary } from '$lib/moodboard';
import { db } from './clients/database-client';

export const listBoards = async (): Promise<BoardSummary[]> =>
	db
		.selectFrom('moodboard')
		.leftJoin('moodboard_item', 'moodboard_item.board_id', 'moodboard.id')
		.select(['moodboard.id', 'name', 'updated_at'])
		.select(sql<number>`count(moodboard_item.id)::integer`.as('item_count'))
		.groupBy('moodboard.id')
		.orderBy('updated_at', 'desc')
		.execute();

export const createBoard = async (name: string) =>
	db.insertInto('moodboard').values({ name }).returning(['id', 'name']).executeTakeFirstOrThrow();

export const getBoard = async (id: string): Promise<Board> => {
	// Read metadata and placements from the same snapshot, including during another tab's save.
	return db
		.transaction()
		.setIsolationLevel('repeatable read')
		.execute(async (trx) => {
			const board = await trx
				.selectFrom('moodboard')
				.selectAll()
				.where('id', '=', id)
				.executeTakeFirst();
			if (!board) error(404, 'Board not found.');
			const items = await trx
				.selectFrom('moodboard_item')
				.innerJoin('image', 'image.id', 'moodboard_item.image_id')
				.select([
					'moodboard_item.id',
					'image_id',
					'x',
					'y',
					'width',
					'height',
					'z_index',
					'image.name as image_name'
				])
				.where('board_id', '=', id)
				.orderBy('z_index')
				.orderBy('moodboard_item.id')
				.execute();
			return {
				id: board.id,
				name: board.name,
				revision: board.revision,
				viewport: { x: board.viewport_x, y: board.viewport_y, zoom: board.viewport_zoom },
				items
			};
		});
};

export const saveBoard = async (id: string, input: BoardSave) => {
	return db.transaction().execute(async (trx) => {
		const board = await trx
			.selectFrom('moodboard')
			.select(['revision'])
			.where('id', '=', id)
			.forUpdate()
			.executeTakeFirst();
		if (!board) error(404, 'Board not found.');
		if (board.revision !== input.revision) {
			error(
				409,
				'This board was changed in another tab. Reload to see the latest version. Your current changes have not been saved.'
			);
		}
		const imageIds = [...new Set(input.items.map((item) => item.image_id))];
		if (imageIds.length) {
			const images = await trx
				.selectFrom('image')
				.select('id')
				.where('id', 'in', imageIds)
				.forKeyShare()
				.execute();
			if (images.length !== imageIds.length) {
				error(
					409,
					'An image on this board was deleted from the library. Reload the board before saving.'
				);
			}
		}
		await trx.deleteFrom('moodboard_item').where('board_id', '=', id).execute();
		if (input.items.length) {
			// Item IDs belong to a single board. Reject IDs taken from another board before insertion.
			const existing = await trx
				.selectFrom('moodboard_item')
				.select('id')
				.where(
					'id',
					'in',
					input.items.map((item) => item.id)
				)
				.executeTakeFirst();
			if (existing) error(400, 'An image placement belongs to another board.');
			await trx
				.insertInto('moodboard_item')
				.values(input.items.map((item) => ({ ...item, board_id: id })))
				.execute();
		}
		return trx
			.updateTable('moodboard')
			.set({
				name: input.name,
				revision: board.revision + 1,
				viewport_x: input.viewport.x,
				viewport_y: input.viewport.y,
				viewport_zoom: input.viewport.zoom,
				updated_at: new Date()
			})
			.where('id', '=', id)
			.returning(['revision', 'updated_at'])
			.executeTakeFirstOrThrow();
	});
};

export const deleteBoard = async (id: string) => {
	const result = await db.deleteFrom('moodboard').where('id', '=', id).executeTakeFirst();
	if (!result.numDeletedRows) error(404, 'Board not found.');
};
