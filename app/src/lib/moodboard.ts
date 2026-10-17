export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const MAX_BOARD_ITEMS = 2000;

export type BoardViewport = { x: number; y: number; zoom: number };
export type BoardItem = {
	id: string;
	image_id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	z_index: number;
};
export type BoardSummary = {
	id: string;
	name: string;
	updated_at: Date | string;
	item_count: number;
};
export type Board = {
	id: string;
	name: string;
	revision: number;
	viewport: BoardViewport;
	items: Array<BoardItem & { image_name: string }>;
};
export type BoardSave = {
	name: string;
	revision: number;
	viewport: BoardViewport;
	items: BoardItem[];
};

export const isUuid = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export const parseBoardName = (value: unknown): string => {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
		throw new Error('Give the board a name between 1 and 120 characters.');
	}
	return value.trim();
};

export const parseBoardSave = (value: unknown): BoardSave => {
	if (!record(value)) throw new Error('Invalid board.');
	const name = parseBoardName(value.name);
	if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
		throw new Error('Invalid board revision.');
	}
	const viewport = value.viewport;
	if (
		!record(viewport) ||
		!numberIn(viewport.x, -1e7, 1e7) ||
		!numberIn(viewport.y, -1e7, 1e7) ||
		!numberIn(viewport.zoom, MIN_ZOOM, MAX_ZOOM)
	) {
		throw new Error('Invalid board viewport.');
	}
	if (!Array.isArray(value.items) || value.items.length > MAX_BOARD_ITEMS) {
		throw new Error(`A board can contain up to ${MAX_BOARD_ITEMS} images.`);
	}
	const ids = new Set<string>();
	const items = value.items.map((item): BoardItem => {
		if (
			!record(item) ||
			!isUuid(item.id) ||
			ids.has(item.id) ||
			!Number.isSafeInteger(item.image_id) ||
			(item.image_id as number) <= 0 ||
			!numberIn(item.x, -1e7, 1e7) ||
			!numberIn(item.y, -1e7, 1e7) ||
			!numberIn(item.width, 1, 20000) ||
			!numberIn(item.height, 1, 20000) ||
			!Number.isSafeInteger(item.z_index) ||
			!numberIn(item.z_index, 0, 1e7)
		) {
			throw new Error('Invalid or duplicate board image.');
		}
		ids.add(item.id);
		return {
			id: item.id,
			image_id: item.image_id as number,
			x: item.x,
			y: item.y,
			width: item.width,
			height: item.height,
			z_index: item.z_index
		};
	});
	return {
		name,
		revision: value.revision as number,
		viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
		items
	};
};
