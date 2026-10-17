import { isFulfilled, isRejected } from '$lib/utils';
import { blobStorageClient } from '../clients/blob-storage-client';
import imageQueries from './image-queries';
import type { ImageCursor } from '../../../types';

type GetManyOptions = {
	cursor?: ImageCursor | null;
	limit?: number;
	tags?: string[];
};

const getMany = async ({ cursor, limit, tags }: GetManyOptions = {}) => {
	const parsed_limit = Math.min(Math.max(Number(limit ?? 30), 1), 100);
	const items = await imageQueries.selectMany({
		cursor,
		limit: parsed_limit + 1,
		tags
	});
	const pageItems = items.slice(0, parsed_limit);

	const results = await Promise.allSettled(
		pageItems.map(async (item) => ({
			id: item.id,
			name: item.name,
			status: item.status,
			uploaded_at: item.uploaded_at,
			tags: await imageQueries.getImageTags(item.id)
		}))
	);

	const fulfilledValues = results.filter(isFulfilled).map((p) => p.value);
	const rejectedReasons = results.filter(isRejected).map((p) => p.reason);

	const lastItem = pageItems[pageItems.length - 1];
	const nextCursor =
		items.length > parsed_limit && lastItem
			? {
					id: lastItem.id,
					uploaded_at: lastItem.cursor_uploaded_at
				}
			: null;

	return { items: fulfilledValues, nextCursor, rejectedReasons };
};

const getOne = async (key: string) => {
	const data = await blobStorageClient.retrieveFile(key);

	const contentType =
		data.stat.metaData?.['content-type'] ??
		data.stat.metaData?.['Content-Type'] ??
		'application/octet-stream';

	return {
		contentType,
		...data
	};
};

const getOneRow = async (key: string) => {
	const image = await imageQueries.selectOne(key);

	if (!image) {
		return undefined;
	}

	return {
		...image,
		tags: await imageQueries.getImageTags(image.id)
	};
};

const getRandom = async (tags?: string[]) => {
	const dbData = await imageQueries.getRandom(tags);

	if (!dbData) {
		return undefined;
	}

	const blobData = await blobStorageClient.retrieveFile(dbData.name);

	if (!blobData) {
		return undefined;
	}

	const contentType =
		blobData.stat.metaData?.['content-type'] ??
		blobData.stat.metaData?.['Content-Type'] ??
		'application/octet-stream';

	return {
		name: dbData.name,
		contentType,
		...blobData
	};
};

const getRandomRow = async (tags?: string[]) => {
	const image = await imageQueries.getRandom(tags);

	if (!image) {
		return undefined;
	}

	return {
		...image,
		tags: await imageQueries.getImageTags(image.id)
	};
};

const createMany = async (files: File[]) => {
	const settled = await Promise.allSettled(
		files.map((file) => blobStorageClient.uploadFile(file, 'images'))
	);

	const ok = settled
		.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
		.map((r) => r.value);

	const created = ok.length ? await imageQueries.createMany(ok.map((name) => ({ name }))) : [];

	const failed = settled.flatMap((result, index) =>
		result.status === 'rejected' ? [{ name: files[index].name, error: String(result.reason) }] : []
	);

	return {
		images: created.map((img) => img.id),
		items: created,
		ok,
		failed
	};
};

const deleteOne = async (key: string) => {
	await imageQueries.deleteOne(key);
	await blobStorageClient.deleteFile(key);
};

export const imageService = {
	getOne,
	getOneRow,
	getMany,
	getRandom,
	getRandomRow,
	createMany,
	deleteOne
};
