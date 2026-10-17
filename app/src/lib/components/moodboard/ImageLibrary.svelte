<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ImageCursor, Tag } from '../../../types';
	import { getResponseErrorMessage } from '$lib/client/http';
	import { IMAGE_DRAG_TYPE, type LibraryImage } from './types';

	let {
		initialImages,
		tags,
		onadd,
		refresh
	}: {
		initialImages: { items: LibraryImage[]; nextCursor: ImageCursor | null };
		tags: Tag[];
		onadd: (image: LibraryImage) => void;
		refresh: number;
	} = $props();
	let images = $state<LibraryImage[]>(untrack(() => initialImages.items));
	let cursor = $state<ImageCursor | null>(untrack(() => initialImages.nextCursor));
	let selectedTag = $state('');
	let loading = $state(false);
	let failure = $state('');
	let request: AbortController | undefined;

	async function load(reset = false) {
		request?.abort();
		const controller = new AbortController();
		request = controller;
		loading = true;
		failure = '';
		if (reset) {
			images = [];
			cursor = null;
		}
		try {
			const params = new SvelteURLSearchParams({ limit: '30' });
			if (selectedTag) params.set('tag', selectedTag);
			if (!reset && cursor) {
				params.set('cursorId', String(cursor.id));
				params.set(
					'cursorUploadedAt',
					cursor.uploaded_at instanceof Date ? cursor.uploaded_at.toISOString() : cursor.uploaded_at
				);
			}
			const response = await fetch(`/api/images?${params}`, { signal: controller.signal });
			if (!response.ok)
				throw new Error(await getResponseErrorMessage(response, 'Could not load images.'));
			const body = await response.json();
			images = reset ? body.items : [...images, ...body.items];
			cursor = body.nextCursor;
		} catch (cause) {
			if (!controller.signal.aborted)
				failure = cause instanceof Error ? cause.message : 'Could not load images.';
		} finally {
			if (request === controller) loading = false;
		}
	}

	$effect(() => () => request?.abort());
	$effect(() => {
		if (refresh)
			untrack(() => {
				void load(true);
			});
	});
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="flex flex-col gap-3 border-b border-base-300 p-3">
		<h2 class="font-semibold">Image library</h2>
		<p class="text-xs text-base-content/60">Drag onto the board, or click to add.</p>
		<select
			class="select w-full select-sm"
			aria-label="Filter library by tag"
			bind:value={selectedTag}
			onchange={() => load(true)}
		>
			<option value="">All tags</option>
			{#each tags as tag (tag.id)}<option value={tag.name}>{tag.name}</option>{/each}
		</select>
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto p-3">
		<div class="grid grid-cols-2 gap-2">
			{#each images as image (image.id)}
				<button
					class="aspect-square cursor-grab overflow-hidden rounded border border-base-300 bg-base-200 hover:border-primary"
					draggable="true"
					aria-label={`Add ${image.name.split('/').pop()} to board`}
					onclick={() => onadd(image)}
					ondragstart={(event) => {
						if (event.dataTransfer) {
							event.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(image));
							event.dataTransfer.effectAllowed = 'copy';
						}
					}}
				>
					<img
						src={`/api${image.name}`}
						alt={image.name.split('/').pop()}
						loading="lazy"
						draggable="false"
						class="h-full w-full object-contain"
					/>
				</button>
			{/each}
		</div>
		{#if failure}
			<p role="alert" class="mt-3 text-sm text-error">{failure}</p>
			<button class="btn mt-2 btn-sm" onclick={() => load(!images.length)}>Retry</button>
		{:else if !images.length && !loading}<p class="py-6 text-center text-sm text-base-content/60">
				No images found. Drop files onto the board to upload.
			</p>{/if}
		{#if loading}<p role="status" class="py-4 text-center text-sm">Loading images…</p>
		{:else if cursor}<button class="btn mt-3 w-full btn-outline btn-sm" onclick={() => load()}
				>Load more</button
			>{/if}
	</div>
</div>
