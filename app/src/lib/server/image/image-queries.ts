import { sql, type SqlBool } from 'kysely';
import { db } from '../clients/database-client';
import type { ImageCursor } from '../../../types';

type SelectManyOptions = {
	cursor?: ImageCursor | null;
	limit: number;
	tags?: string[];
};

const selectMany = async ({ cursor, limit, tags }: SelectManyOptions) => {
	const applyCursor = <T extends ReturnType<typeof db.selectFrom<'image'>>>(query: T): T => {
		if (!cursor) return query;

		return query.where(
			sql<SqlBool>`(image.uploaded_at, image.id) < (${String(cursor.uploaded_at)}::timestamp, ${cursor.id})`
		) as T;
	};

	if (!tags?.length) {
		const query = db
			.selectFrom('image')
			.selectAll('image')
			.select(sql<string>`image.uploaded_at::text`.as('cursor_uploaded_at'))
			.orderBy('image.uploaded_at', 'desc')
			.orderBy('image.id', 'desc')
			.limit(limit);

		const images = await applyCursor(query).execute();

		return images;
	}

	const query = db
		.selectFrom('image')
		.innerJoin('image_tags as it', 'it.image_id', 'image.id')
		.innerJoin('tag as t', 't.id', 'it.tag_id')
		.selectAll('image')
		.select(sql<string>`image.uploaded_at::text`.as('cursor_uploaded_at'))
		.distinct()
		.where('t.name', 'in', tags ?? [])
		.orderBy('image.uploaded_at', 'desc')
		.orderBy('image.id', 'desc')
		.limit(limit);

	const images = await applyCursor(query).execute();

	return images;
};

const selectOne = async (key: string) => {
	const image = await db
		.selectFrom('image')
		.where('image.name', '=', key)
		.selectAll()
		.executeTakeFirst();

	return image;
};

// const updateOne = async (key: string, tags: string[]) => {
// 	await db.transaction().execute(async (trx) => {
// 		await db.updateTable('image').set({ tags }).where('image.name', '=', key).execute();
// 	});
// };

const getTagIdsByNames = async (names: string[]) => {
	if (!names.length) return [];

	const rows = await db.selectFrom('tag').select(['id']).where('name', 'in', names).execute();

	return rows.map((r) => r.id);
};

const replaceImageTags = async (imageId: number, tagIds: number[]) => {
	await db.transaction().execute(async (trx) => {
		await trx.deleteFrom('image_tags').where('image_id', '=', imageId).execute();

		if (tagIds.length) {
			await trx
				.insertInto('image_tags')
				.values(
					tagIds.map((tagId) => ({
						image_id: imageId,
						tag_id: tagId
					}))
				)
				.onConflict((oc) => oc.columns(['image_id', 'tag_id']).doNothing())
				.execute();
		}
	});
};

/**
 *  If performance becomes a problem, see https://stackoverflow.com/questions/8674718/best-way-to-select-random-rows-postgresql
 */
const getRandom = async (tags?: string[]) => {
	if (tags?.length === 0) {
		return await db
			.selectFrom('image')
			.selectAll()
			.orderBy(sql`RANDOM()`)
			.limit(1)
			.executeTakeFirst();
	}

	const matchingImages = db
		.selectFrom('image')
		.innerJoin('image_tags as it', 'it.image_id', 'image.id')
		.innerJoin('tag as t', 't.id', 'it.tag_id')
		.selectAll('image')
		.where('t.name', 'in', tags ?? [])
		.distinct()
		.as('matching_images');

	return db
		.selectFrom(matchingImages)
		.selectAll()
		.orderBy(sql`RANDOM()`)
		.limit(1)
		.executeTakeFirst();
};

const createMany = async (images: Array<{ name: string }>) =>
	await db
		.insertInto('image')
		.values(images.map((image) => ({ name: image.name, status: 'uploaded' })))
		.returning(['id', 'name'])
		.execute();

const insertImageTags = async (imageId: number, tagIds: number[]) => {
	const values = tagIds.map((tagId) => ({
		image_id: imageId,
		tag_id: tagId
	}));

	await db.insertInto('image_tags').values(values).execute();
};

const deleteImageTag = async (image: string, tag: string) => {
	const imageRecord = await db
		.selectFrom('image')
		.where('image.name', '=', image)
		.selectAll()
		.executeTakeFirst();

	if (!imageRecord) {
		throw new Error(`Image with name ${image} not found`);
	}

	const tagRecord = await db
		.selectFrom('tag')
		.where('tag.name', '=', tag)
		.selectAll()
		.executeTakeFirst();

	if (!tagRecord) {
		throw new Error(`Tag with name ${tag} not found`);
	}

	const imageId = imageRecord.id;
	const tagId = tagRecord.id;

	await db
		.deleteFrom('image_tags')
		.where('image_id', '=', imageId)
		.where('tag_id', '=', tagId)
		.execute();
};

const getImageTags = async (imageId: number) =>
	await db
		.selectFrom('image_tags')
		.where('image_tags.image_id', '=', imageId)
		.innerJoin('tag', 'tag.id', 'image_tags.tag_id')
		.selectAll()
		.execute();

const deleteOne = async (key: string) => {
	await db.deleteFrom('image').where('image.name', '=', key).executeTakeFirst();
};

const imageQueries = {
	selectOne,
	selectMany,
	getRandom,
	replaceImageTags,
	getTagIdsByNames,
	//updateOne,
	createMany,
	insertImageTags,
	deleteImageTag,
	getImageTags,
	deleteOne
};

export default imageQueries;
