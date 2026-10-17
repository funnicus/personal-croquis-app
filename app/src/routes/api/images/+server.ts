import type { RequestHandler } from './$types';
import { imageService } from '$lib/server/image/image-service';
import { json, redirect } from '@sveltejs/kit';
import { StatusCodes } from 'http-status-codes';
import { imageTaggingService } from '$lib/server/image/image-tagging-service';

export const GET: RequestHandler = async ({ url }) => {
	const limit = Number(url.searchParams.get('limit')) || 50;
	const tags = url.searchParams.getAll('tag');
	const cursorUploadedAt = url.searchParams.get('cursorUploadedAt');
	const cursorId = Number(url.searchParams.get('cursorId'));
	const cursor =
		cursorUploadedAt && Number.isFinite(cursorId)
			? { uploaded_at: cursorUploadedAt, id: cursorId }
			: null;

	const { items, nextCursor } = await imageService.getMany({ cursor, limit, tags });

	return new Response(JSON.stringify({ items, nextCursor }), {
		headers: { 'content-type': 'application/json' },
		status: StatusCodes.OK
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const files = form.getAll('images').filter((v): v is File => v instanceof File);

	if (files.length === 0) {
		return new Response(JSON.stringify({ error: 'No files provided under "images"' }), {
			status: StatusCodes.BAD_REQUEST
		});
	}
	if (files.some((file) => !file.type.startsWith('image/') || file.size === 0)) {
		return json({ error: 'Only non-empty image files can be uploaded.' }, { status: 400 });
	}

	const results = await imageService.createMany(files);

	await imageTaggingService.enqueueMany(results.images);

	if (results.failed.length > 0) {
		console.error('Some images failed to create.');
	}
	if (request.headers.get('accept')?.includes('application/json')) {
		return json(
			{ items: results.items, failed: results.failed },
			{
				status: results.items.length ? StatusCodes.CREATED : StatusCodes.BAD_GATEWAY
			}
		);
	}

	return redirect(StatusCodes.SEE_OTHER, '/gallery');
};
