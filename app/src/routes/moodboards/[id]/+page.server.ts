import { error } from '@sveltejs/kit';
import { isUuid } from '$lib/moodboard';
import { getBoard } from '$lib/server/moodboard-service';
import { imageService } from '$lib/server/image/image-service';
import tagQueries from '$lib/server/image/tag-queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) error(404, 'Board not found.');
	const [board, images, tags] = await Promise.all([
		getBoard(params.id),
		imageService.getMany({ limit: 30 }),
		tagQueries.getAllTags()
	]);
	return { board, images, tags };
};
