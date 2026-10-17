import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { Board, BoardSave } from '../src/lib/moodboard';

const svg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#d4a574"/></svg>';
type ImageRow = { id: number; name: string };
type Resources = {
	createBoard: () => Promise<Board>;
	upload: () => Promise<ImageRow>;
	trackImage: (name: string) => void;
	trackBoard: (id: string) => void;
};

const test = base.extend<{ resources: Resources }>({
	resources: async ({ request }, use) => {
		const boards: string[] = [];
		const images: string[] = [];
		await use({
			async createBoard() {
				const response = await request.post('/api/moodboards', {
					data: { name: `Test board ${randomUUID()}` }
				});
				expect(response.status()).toBe(201);
				const created = await response.json();
				boards.push(created.id);
				return (await request.get(`/api/moodboards/${created.id}`)).json();
			},
			async upload() {
				const response = await request.post('/api/images', {
					headers: { accept: 'application/json' },
					multipart: {
						images: {
							name: `moodboard-test-${randomUUID()}.svg`,
							mimeType: 'image/svg+xml',
							buffer: Buffer.from(svg)
						}
					}
				});
				expect(response.status()).toBe(201);
				const result = await response.json();
				images.push(result.items[0].name);
				return result.items[0];
			},
			trackImage: (name) => images.push(name),
			trackBoard: (id) => boards.push(id)
		});
		for (const id of boards) await request.delete(`/api/moodboards/${id}`);
		for (const name of images) await request.delete(`/api${name}`);
	}
});

async function saved(page: Page) {
	await expect(page.getByTestId('save-status')).toHaveText('Saved');
}

test('create, rename, reopen, and delete a named board', async ({ page, request, resources }) => {
	const name = `New board ${randomUUID()}`;
	await page.goto('/moodboards');
	await page.getByRole('textbox', { name: 'New board name' }).fill(name);
	await page.getByRole('button', { name: 'Create board' }).click();
	await expect(page).toHaveURL(/\/moodboards\/[0-9a-f-]+$/);
	const id = page.url().split('/').pop()!;
	resources.trackBoard(id);
	await expect(page.getByRole('textbox', { name: 'Board name' })).toHaveValue(name);
	await page.getByRole('textbox', { name: 'Board name' }).fill(`${name} renamed`);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await saved(page);
	await page.getByRole('link', { name: '← Boards' }).click();
	await page.getByRole('link', { name: `${name} renamed`, exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Board name' })).toHaveValue(`${name} renamed`);
	await page.getByRole('textbox', { name: 'Board name' }).fill(`${name} final`);
	await page.getByRole('link', { name: '← Boards' }).click();
	await page.getByRole('button', { name: `Delete ${name} final`, exact: true }).click();
	await page.getByRole('button', { name: 'Delete board', exact: true }).click();
	await expect(page.getByRole('link', { name: `${name} final`, exact: true })).toHaveCount(0);
	expect((await request.get(`/api/moodboards/${id}`)).status()).toBe(404);
});

test('drop files, drag library images, move, resize, zoom, pan, and restore the board', async ({
	page,
	request,
	resources
}) => {
	const board = await resources.createBoard();
	const image = await resources.upload();
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto(`/moodboards/${board.id}`);
	await expect(page.getByRole('button', { name: 'Upload images', exact: true })).toBeEnabled();
	const canvas = page.getByRole('region', { name: 'Moodboard canvas' });
	const bounds = (await canvas.boundingBox())!;
	const dataTransfer = await page.evaluateHandle(
		({ content, filename }) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File([content], filename, { type: 'image/svg+xml' }));
			return transfer;
		},
		{ content: svg, filename: `dropped-${randomUUID()}.svg` }
	);
	const uploadResponse = page.waitForResponse(
		(response) => response.url().endsWith('/api/images') && response.request().method() === 'POST'
	);
	await canvas.dispatchEvent('drop', {
		dataTransfer,
		clientX: bounds.x + 80,
		clientY: bounds.y + 100
	});
	const uploaded = await (await uploadResponse).json();
	resources.trackImage(uploaded.items[0].name);
	await expect(page.locator('.svelte-flow__node')).toHaveCount(1);
	await saved(page);
	let state: Board = await (await request.get(`/api/moodboards/${board.id}`)).json();
	expect(state.items[0].x).toBeCloseTo(80, 0);
	expect(state.items[0].y).toBeCloseTo(100, 0);
	expect(state.items[0].width / state.items[0].height).toBeCloseTo(2);

	const node = page.locator('.svelte-flow__node').first();
	const original = state.items[0];
	const nodeBounds = (await node.boundingBox())!;
	await page.mouse.move(nodeBounds.x + 60, nodeBounds.y + 40);
	await page.mouse.down();
	await page.mouse.move(nodeBounds.x + 180, nodeBounds.y + 120, { steps: 12 });
	await page.mouse.up();
	await saved(page);
	state = await (await request.get(`/api/moodboards/${board.id}`)).json();
	// The drag threshold can consume the first pointer movement.
	expect(state.items[0].x).toBeGreaterThan(original.x + 100);
	expect(state.items[0].y).toBeGreaterThan(original.y + 60);

	const resize = node.locator('.svelte-flow__resize-control.handle.bottom.right');
	const resizeBounds = (await resize.boundingBox())!;
	await page.mouse.move(
		resizeBounds.x + resizeBounds.width / 2,
		resizeBounds.y + resizeBounds.height / 2
	);
	await page.mouse.down();
	await page.mouse.move(resizeBounds.x + 90, resizeBounds.y + 45, { steps: 12 });
	await page.mouse.up();
	await saved(page);
	state = await (await request.get(`/api/moodboards/${board.id}`)).json();
	expect(state.items[0].width).toBeGreaterThan(original.width);
	expect(state.items[0].width / state.items[0].height).toBeCloseTo(2);

	const libraryImage = page.getByRole('button', {
		name: `Add ${image.name.split('/').pop()} to board`,
		exact: true
	});
	await libraryImage.dragTo(canvas, { targetPosition: { x: 520, y: 360 } });
	await expect(page.locator('.svelte-flow__node')).toHaveCount(2);
	await saved(page);
	await page.mouse.move(bounds.x + 700, bounds.y + 450);
	await page.mouse.wheel(0, -250);
	await expect
		.poll(async () => {
			const current = await (await request.get(`/api/moodboards/${board.id}`)).json();
			return current.viewport.zoom;
		})
		.toBeGreaterThan(1);
	await saved(page);
	await page.mouse.move(bounds.x + 750, bounds.y + 500);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 800, bounds.y + 550, { steps: 10 });
	await page.mouse.up();
	await saved(page);
	const beforeReload: Board = await (await request.get(`/api/moodboards/${board.id}`)).json();
	expect(beforeReload.viewport.x).not.toBe(0);
	await page.reload();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(2);
	await saved(page);
	const restored: Board = await (await request.get(`/api/moodboards/${board.id}`)).json();
	expect(restored.items).toEqual(beforeReload.items);
	expect(restored.viewport).toEqual(beforeReload.viewport);
	await page.getByRole('button', { name: 'Fit all', exact: true }).click();
	await page.locator('.svelte-flow__node').first().click();
	await page.getByRole('button', { name: 'Remove selected' }).click();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(1);
	await saved(page);
	expect((await request.get(`/api${uploaded.items[0].name}`)).status()).toBe(200);
	expect(pageErrors).toEqual([]);
});

test('failed saves stay visible and can be retried', async ({ page, request, resources }) => {
	const board = await resources.createBoard();
	await page.goto(`/moodboards/${board.id}`);
	await page.route(`**/api/moodboards/${board.id}`, async (route) => {
		if (route.request().method() === 'PUT') {
			await route.fulfill({
				status: 503,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Storage temporarily unavailable' })
			});
		} else await route.continue();
	});
	await page.getByRole('textbox', { name: 'Board name' }).fill('Retry this board');
	await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
	await expect(page.getByTestId('save-status')).toHaveText('Not saved');
	expect((await (await request.get(`/api/moodboards/${board.id}`)).json()).name).toBe(board.name);
	await page.unroute(`**/api/moodboards/${board.id}`);
	await page.getByRole('button', { name: 'Retry save' }).click();
	await saved(page);
	expect((await (await request.get(`/api/moodboards/${board.id}`)).json()).name).toBe(
		'Retry this board'
	);
});

test('another tab cannot silently overwrite a newer save', async ({
	page,
	context,
	request,
	resources
}) => {
	const board = await resources.createBoard();
	await page.goto(`/moodboards/${board.id}`);
	const other = await context.newPage();
	await other.goto(`/moodboards/${board.id}`);
	await page.getByRole('textbox', { name: 'Board name' }).fill('First tab saved');
	await saved(page);
	await other.getByRole('textbox', { name: 'Board name' }).fill('Stale tab changes');
	await expect(other.getByRole('alert')).toContainText('changed in another tab');
	expect((await (await request.get(`/api/moodboards/${board.id}`)).json()).name).toBe(
		'First tab saved'
	);
	other.once('dialog', (dialog) => dialog.accept());
	await other.getByRole('button', { name: 'Reload saved board' }).click();
	await expect(other.getByRole('textbox', { name: 'Board name' })).toHaveValue('First tab saved');
	await other.close();
});

test('board API validates input and saves atomically with revision checks', async ({
	request,
	resources
}) => {
	const board = await resources.createBoard();
	const image = await resources.upload();
	const item = {
		id: randomUUID(),
		image_id: image.id,
		x: -120,
		y: 80,
		width: 200,
		height: 100,
		z_index: 2
	};
	const input: BoardSave = {
		name: 'API board',
		revision: 0,
		viewport: { x: 20, y: -30, zoom: 0.75 },
		items: [item, { ...item, id: randomUUID(), x: 200 }]
	};
	for (const invalid of [
		{ ...input, name: ' ' },
		{ ...input, name: 'x'.repeat(121) },
		{ ...input, viewport: { ...input.viewport, zoom: 0 } },
		{ ...input, revision: -1 },
		{ ...input, items: [item, item] },
		{ ...input, items: [{ ...item, width: -1 }] },
		{ ...input, items: [{ ...item, image_id: 1.5 }] },
		{ ...input, items: [{ ...item, x: '100' }] }
	]) {
		expect((await request.put(`/api/moodboards/${board.id}`, { data: invalid })).status()).toBe(
			400
		);
	}
	expect((await request.get('/api/moodboards/not-an-id')).status()).toBe(404);
	expect((await request.get(`/api/moodboards/${randomUUID()}`)).status()).toBe(404);
	const responses = await Promise.all([
		request.put(`/api/moodboards/${board.id}`, { data: input }),
		request.put(`/api/moodboards/${board.id}`, { data: { ...input, name: 'Concurrent save' } })
	]);
	expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
	const persisted: Board = await (await request.get(`/api/moodboards/${board.id}`)).json();
	expect(persisted.items).toHaveLength(2);
	expect(persisted.viewport).toEqual(input.viewport);
	expect(persisted.revision).toBe(1);
	const missingImage = { ...input, revision: 1, items: [{ ...item, image_id: 2147483647 }] };
	expect((await request.put(`/api/moodboards/${board.id}`, { data: missingImage })).status()).toBe(
		409
	);
	expect((await (await request.get(`/api/moodboards/${board.id}`)).json()).items).toEqual(
		persisted.items
	);
	const other = await resources.createBoard();
	expect((await request.put(`/api/moodboards/${other.id}`, { data: input })).status()).toBe(400);
	expect((await (await request.get(`/api/moodboards/${other.id}`)).json()).revision).toBe(0);
	await request.delete(`/api${image.name}`);
	expect((await (await request.get(`/api/moodboards/${board.id}`)).json()).items).toHaveLength(0);
});

test('mobile board supports uploading and reopening without horizontal page overflow', async ({
	page,
	resources
}) => {
	const board = await resources.createBoard();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/moodboards/${board.id}`);
	await expect(page.getByRole('complementary', { name: 'Image library' })).toHaveCount(0);
	const response = page.waitForResponse(
		(response) => response.url().endsWith('/api/images') && response.request().method() === 'POST'
	);
	await page.getByLabel('Upload images to board').setInputFiles({
		name: `mobile-${randomUUID()}.svg`,
		mimeType: 'image/svg+xml',
		buffer: Buffer.from(svg)
	});
	resources.trackImage((await (await response).json()).items[0].name);
	await expect(page.locator('.svelte-flow__node')).toHaveCount(1);
	await saved(page);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.reload();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(1);
});
