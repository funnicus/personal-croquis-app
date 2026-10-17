/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('moodboard')
		.addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
		.addColumn('name', 'varchar(120)', (col) => col.notNull())
		.addColumn('revision', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('viewport_x', 'double precision', (col) => col.notNull().defaultTo(0))
		.addColumn('viewport_y', 'double precision', (col) => col.notNull().defaultTo(0))
		.addColumn('viewport_zoom', 'double precision', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
		.addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
		.execute();
	await db.schema
		.createTable('moodboard_item')
		.addColumn('id', 'uuid', (col) => col.primaryKey())
		.addColumn('board_id', 'uuid', (col) =>
			col.notNull().references('moodboard.id').onDelete('cascade')
		)
		.addColumn('image_id', 'integer', (col) =>
			col.notNull().references('image.id').onDelete('cascade')
		)
		.addColumn('x', 'double precision', (col) => col.notNull())
		.addColumn('y', 'double precision', (col) => col.notNull())
		.addColumn('width', 'double precision', (col) => col.notNull())
		.addColumn('height', 'double precision', (col) => col.notNull())
		.addColumn('z_index', 'integer', (col) => col.notNull().defaultTo(0))
		.execute();
	await db.schema
		.createIndex('moodboard_item_board_idx')
		.on('moodboard_item')
		.column('board_id')
		.execute();
	await db.schema
		.createIndex('moodboard_item_image_idx')
		.on('moodboard_item')
		.column('image_id')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('moodboard_item').execute();
	await db.schema.dropTable('moodboard').execute();
}
