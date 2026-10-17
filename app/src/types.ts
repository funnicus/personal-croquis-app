import type { ColumnType, Generated } from 'kysely';

export type ImagesWithTags = ImageTable & {
	tags: Array<TagTable & ImageTagsTable>;
};

export interface Database {
	image: ImageTable;
	image_tags: ImageTagsTable;
	tag: TagTable;
	image_tagging_job: ImageTaggingJobTable;
	moodboard: MoodboardTable;
	moodboard_item: MoodboardItemTable;
}

export interface MoodboardTable {
	id: Generated<string>;
	name: string;
	revision: Generated<number>;
	viewport_x: Generated<number>;
	viewport_y: Generated<number>;
	viewport_zoom: Generated<number>;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}

export interface MoodboardItemTable {
	id: string;
	board_id: string;
	image_id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	z_index: number;
}

export interface ImageTable {
	id: Generated<number>;
	name: string;
	status: ImageStatus;
	uploaded_at: ColumnType<Date, string | undefined, never>;
}

export interface TagTable {
	id: Generated<number>;
	name: string;
}

export interface ImageTagsTable {
	image_id: number;
	tag_id: number;
}

export interface ImageTaggingJobTable {
	id: Generated<string>;
	image_id: number;
	status: Generated<ImageTaggingStatus>;
	attempts: Generated<number>;
	error: ColumnType<string | null, string | null | undefined, string | null>;
	started_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
	created_at: Generated<Date>;
	finished_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
}

export type Tag = { id: number; name: string };

export type TagWithUsage = Tag & {
	usage_count: number;
};

export type Row = {
	id: number;
	name: string;
	uploaded_at: string | Date;
	tags: Tag[];
};

export type ImageCursor = {
	uploaded_at: string | Date;
	id: number;
};

export type ImageStatus = 'uploaded' | 'tagging_queued' | 'tagging' | 'tagged' | 'tagging_failed';

export type ImageTaggingStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type TaggingJob = {
	jobId: string;
	imageId: number;
	imageName: string;
};

export type ArtisticTagResponse = {
	[category: string]: string[] | string | null | undefined;
	expression: string[];
	pose: string[];
	composition: string[];
	style: string[];
	practice_value: string[];
	mood: string[];
	notes?: string | null;
};
