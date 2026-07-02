<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ImageCursor, Row, Tag } from '../../types';
	import type { PageProps } from './$types';
	import { getResponseErrorMessage } from '$lib/client/http';
	import { getGroupedTags } from '$lib/tag-display';
	import { toast } from '$lib/toasts';
	import GalleryView from '$lib/components/gallery/GalleryView.svelte';
	import GalleryTable from '$lib/components/gallery/GalleryTable.svelte';
	import GalleryTaggingView from '$lib/components/gallery/GalleryTaggingView.svelte';

	type GalleryViewMode = 'table' | 'gallery' | 'tagging';

	let { data }: PageProps = $props();

	let rows: Row[] = $state([]);
	let tags: Tag[] = $state([]);
	let selectedTags: string[] = $state([]);
	let nextCursor: ImageCursor | null = $state(null);
	let viewMode: GalleryViewMode = $state('table');
	let lightboxSrc: string | null = $state(null);
	let loadingMore = $state(false);

	const groupedTags = $derived(getGroupedTags(tags));

	$effect(() => {
		rows = [...data.images.items];
		tags = [...data.tags];
		selectedTags = [...data.selectedTags];
		nextCursor = data.images.nextCursor;
	});

	const openLightbox = (src: string) => (lightboxSrc = src);
	const closeLightbox = () => (lightboxSrc = null);

	const formatCursorUploadedAt = (cursor: ImageCursor) =>
		cursor.uploaded_at instanceof Date ? cursor.uploaded_at.toISOString() : cursor.uploaded_at;

	const getImageQuery = (cursor?: ImageCursor | null) => {
		const params = new SvelteURLSearchParams();
		params.set('limit', '50');
		selectedTags.forEach((tag) => params.append('tag', tag));

		if (cursor) {
			params.set('cursorUploadedAt', formatCursorUploadedAt(cursor));
			params.set('cursorId', String(cursor.id));
		}

		return params;
	};

	const applyTagFilters = async (nextSelectedTags: string[]) => {
		const params = new SvelteURLSearchParams();
		nextSelectedTags.forEach((tag) => params.append('tag', tag));
		const query = params.toString();
		const galleryPath = resolve('/gallery');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${galleryPath}${query ? `?${query}` : ''}`, {
			keepFocus: true,
			noScroll: true
		});
	};

	const toggleTagFilter = async (tag: string) => {
		const nextSelectedTags = selectedTags.includes(tag)
			? selectedTags.filter((item) => item !== tag)
			: [...selectedTags, tag];

		await applyTagFilters(nextSelectedTags);
	};

	const clearTagFilters = async () => {
		await applyTagFilters([]);
	};

	const loadMore = async () => {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;

		try {
			const params = getImageQuery(nextCursor);
			const result = await fetch(`/api/images?${params.toString()}`);

			if (!result.ok) {
				toast.error(await getResponseErrorMessage(result, 'Failed to load more images'));
				return;
			}

			const body = (await result.json()) as {
				items: Row[];
				nextCursor: ImageCursor | null;
			};

			rows = [...rows, ...body.items];
			nextCursor = body.nextCursor;
		} catch {
			toast.error('Failed to load more images');
		} finally {
			loadingMore = false;
		}
	};
</script>

<div class="flex flex-col gap-5">
	<div class="rounded-box border border-base-300 bg-base-100">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-3 py-2"
		>
			<div>
				<h2 class="text-sm font-semibold">Filters</h2>
				<p class="text-xs text-base-content/60">
					{selectedTags.length ? `${selectedTags.length} selected` : 'All images'}
				</p>
			</div>
			<button class="btn btn-xs" onclick={clearTagFilters} disabled={!selectedTags.length}
				>Clear</button
			>
		</div>
		<div class="max-h-64 overflow-y-auto">
			<table class="table-pin-rows table table-xs">
				<tbody>
					{#each groupedTags as group (group.category)}
						<tr>
							<th colspan="2" class="bg-base-200 text-xs font-semibold uppercase">
								{group.categoryLabel}
							</th>
						</tr>
						{#each group.tags as tag (tag.name)}
							<tr class="hover:bg-base-200">
								<td class="w-8">
									<input
										type="checkbox"
										class="checkbox checkbox-xs"
										checked={selectedTags.includes(tag.name)}
										aria-label={`Filter by ${group.categoryLabel} ${tag.label}`}
										onchange={() => toggleTagFilter(tag.name)}
									/>
								</td>
								<td class="text-sm">{tag.label}</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="join grid grid-cols-3 gap-1">
		<button
			class={`btn join-item ${viewMode === 'table' ? 'btn-active' : 'btn-outline'}`}
			onclick={() => (viewMode = 'table')}>Table View</button
		>
		<button
			class={`btn join-item ${viewMode === 'gallery' ? 'btn-active' : 'btn-outline'}`}
			onclick={() => (viewMode = 'gallery')}>Gallery View</button
		>
		<button
			class={`btn join-item ${viewMode === 'tagging' ? 'btn-active' : 'btn-outline'}`}
			onclick={() => (viewMode = 'tagging')}>Tagging View</button
		>
	</div>
	{#if viewMode === 'gallery'}
		<GalleryView {rows} {lightboxSrc} {openLightbox} {closeLightbox} />
	{:else if viewMode === 'tagging'}
		<GalleryTaggingView bind:rows bind:tags {lightboxSrc} {openLightbox} {closeLightbox} />
	{:else}
		<GalleryTable {rows} {tags} {groupedTags} />
	{/if}

	{#if nextCursor}
		<div class="flex justify-center">
			<button class="btn btn-outline" onclick={loadMore} disabled={loadingMore}>
				{loadingMore ? 'Loading' : 'Load more'}
			</button>
		</div>
	{/if}
</div>
