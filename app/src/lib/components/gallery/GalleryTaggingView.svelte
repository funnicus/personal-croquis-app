<script lang="ts">
	import clientTagService from '$lib/client/tagService';
	import { getGroupedTags } from '$lib/tag-display';
	import { toast } from '$lib/toasts';
	import type { Row, Tag } from '../../../types';
	import { tick } from 'svelte';

	type Props = {
		rows: Row[];
		tags: Tag[];
		lightboxSrc: string | null;
		openLightbox: (src: string) => void;
		closeLightbox: () => void;
	};

	let {
		rows = $bindable(),
		tags = $bindable(),
		lightboxSrc,
		openLightbox,
		closeLightbox
	}: Props = $props();

	let pendingTagKeys: string[] = $state([]);
	let pendingAddRows: number[] = $state([]);
	let newTagNames: Record<number, string> = $state({});
	let tagSearchQueries: Record<number, string> = $state({});
	let tagListElements: Record<number, HTMLDivElement> = {};
	let tagListScrollPositions: Record<number, number> = {};
	let renderedTagEditorRows: Set<number> = $state(new Set());

	const groupedTags = $derived(getGroupedTags(tags));
	const rowTagNameSets = $derived(
		new Map(rows.map((row) => [row.id, new Set(row.tags.map((tag) => tag.name))]))
	);

	const tagKey = (row: Row, tag: string) => `${row.id}:${tag}`;
	const isTagPending = (row: Row, tag: string) => pendingTagKeys.includes(tagKey(row, tag));
	const isAddPending = (row: Row) => pendingAddRows.includes(row.id);
	const getVisibleTagGroups = (row: Row) => {
		const query = (tagSearchQueries[row.id] ?? '').trim().toLocaleLowerCase();
		if (!query) return groupedTags;

		return groupedTags
			.map((group) => ({
				...group,
				tags: group.tags.filter((tag) =>
					[tag.name, tag.label, group.category, group.categoryLabel].some((value) =>
						value.toLocaleLowerCase().includes(query)
					)
				)
			}))
			.filter((group) => group.tags.length > 0);
	};
	const updateTagSearch = async (row: Row, nextQuery: string) => {
		const previousQuery = tagSearchQueries[row.id] ?? '';
		const tagList = tagListElements[row.id];

		if (!previousQuery && nextQuery && tagList) {
			tagListScrollPositions[row.id] = tagList.scrollTop;
		}

		tagSearchQueries[row.id] = nextQuery;

		if (previousQuery && !nextQuery && tagList) {
			await tick();
			tagList.scrollTop = tagListScrollPositions[row.id] ?? 0;
		}
	};
	const preloadTagEditor = (node: HTMLElement, rowId: number) => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting || renderedTagEditorRows.has(rowId)) return;
				renderedTagEditorRows = new Set([...renderedTagEditorRows, rowId]);
				observer.disconnect();
			},
			{ rootMargin: '100% 0px' }
		);

		observer.observe(node);

		return {
			destroy: () => observer.disconnect()
		};
	};

	const toggleTag = async (row: Row, tagName: string) => {
		const key = tagKey(row, tagName);
		if (pendingTagKeys.includes(key)) return;
		pendingTagKeys = [...pendingTagKeys, key];

		try {
			const hasTag = row.tags.some((tag) => tag.name === tagName);
			const result = hasTag
				? await clientTagService.removeTagFromImage(row.name, tagName)
				: await clientTagService.addNewTagToImage(row.name, tagName);

			if (!result.ok) {
				toast.error(result.message);
				return;
			}

			rows = rows.map((item) => {
				if (item.id !== row.id) return item;

				return {
					...item,
					tags: hasTag
						? item.tags.filter((tag) => tag.name !== tagName)
						: [...item.tags, tags.find((tag) => tag.name === tagName) ?? { id: -1, name: tagName }]
				};
			});
		} finally {
			pendingTagKeys = pendingTagKeys.filter((item) => item !== key);
		}
	};

	const addNewTag = async (row: Row) => {
		const tagName = (newTagNames[row.id] ?? '').trim();
		if (!tagName || isAddPending(row)) return;
		pendingAddRows = [...pendingAddRows, row.id];

		try {
			const result = await clientTagService.addNewTagToImage(row.name, tagName);
			if (!result.ok) {
				toast.error(result.message);
				return;
			}

			const existingTag = tags.find((tag) => tag.name === tagName);
			rows = rows.map((item) =>
				item.id === row.id && !item.tags.some((tag) => tag.name === tagName)
					? { ...item, tags: [...item.tags, existingTag ?? { id: -1, name: tagName }] }
					: item
			);

			if (!existingTag) tags = [...tags, { id: -1, name: tagName }];
			newTagNames[row.id] = '';
		} finally {
			pendingAddRows = pendingAddRows.filter((id) => id !== row.id);
		}
	};
</script>

<section class="flex flex-col gap-6">
	{#each rows as row, index (row.id)}
		{@const visibleTagGroups = getVisibleTagGroups(row)}
		<article
			class="grid min-h-[calc(100vh-7rem)] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm lg:h-[calc(100vh-7rem)] lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]"
			use:preloadTagEditor={row.id}
		>
			<div class="flex min-h-[50vh] items-center justify-center bg-base-200/60 p-3 lg:min-h-0">
				<button
					class="flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0"
					onclick={() => openLightbox(`/api${row.name}`)}
					aria-label={`View ${row.name} fullscreen`}
				>
					<img
						src={`/api${row.name}`}
						alt={row.name}
						loading={index < 2 ? 'eager' : 'lazy'}
						decoding="async"
						class="max-h-[calc(100vh-8.5rem)] max-w-full object-contain"
					/>
				</button>
			</div>

			<aside class="flex min-h-0 flex-col border-t border-base-300 lg:border-t-0 lg:border-l">
				<header class="border-b border-base-300 px-4 py-3">
					<p class="truncate text-sm font-semibold" title={row.name}>
						{row.name.split('/images/').pop()}
					</p>
					<p class="mt-1 text-xs text-base-content/60">
						{row.tags.length}
						{row.tags.length === 1 ? 'tag' : 'tags'} selected
					</p>
				</header>
				<div class="border-b border-base-300 p-3">
					<label class="input flex w-full items-center gap-2 input-sm">
						<svg
							class="h-4 w-4 shrink-0 opacity-50"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<circle cx="11" cy="11" r="8"></circle>
							<path d="m21 21-4.3-4.3"></path>
						</svg>
						<input
							type="search"
							class="grow"
							placeholder="Filter tags"
							aria-label={`Filter tags for ${row.name}`}
							value={tagSearchQueries[row.id] ?? ''}
							oninput={(event) => updateTagSearch(row, event.currentTarget.value)}
						/>
					</label>
				</div>

				{#if index === 0 || renderedTagEditorRows.has(row.id)}
					<div class="min-h-0 flex-1 overflow-y-auto p-4" bind:this={tagListElements[row.id]}>
						{#if groupedTags.length === 0}
							<p class="text-sm text-base-content/60">No tags yet.</p>
						{/if}

						{#if groupedTags.length > 0 && visibleTagGroups.length === 0}
							<p class="text-sm text-base-content/60">No tags match this search.</p>
						{/if}

						<div class="flex flex-col gap-4">
							{#each visibleTagGroups as group (group.category)}
								<fieldset>
									<legend
										class="mb-2 text-xs font-semibold tracking-wide text-base-content/60 uppercase"
									>
										{group.categoryLabel}
									</legend>
									<div class="grid grid-cols-1 gap-1 xl:grid-cols-2">
										{#each group.tags as tag (tag.name)}
											<label
												class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-base-200"
											>
												<input
													type="checkbox"
													class="checkbox checkbox-sm"
													checked={rowTagNameSets.get(row.id)?.has(tag.name) ?? false}
													disabled={isTagPending(row, tag.name)}
													onchange={() => toggleTag(row, tag.name)}
												/>
												<span class="text-sm" title={tag.name}>{tag.label}</span>
											</label>
										{/each}
									</div>
								</fieldset>
							{/each}
						</div>
					</div>
				{:else}
					<div class="flex min-h-0 flex-1 items-center justify-center p-4">
						<span class="loading loading-sm loading-spinner text-base-content/40"></span>
					</div>
				{/if}

				<footer class="border-t border-base-300 p-4">
					<div class="join flex w-full">
						<input
							class="input join-item min-w-0 flex-1 input-sm"
							placeholder="Add new tag (example: expression/mouth_open)"
							bind:value={newTagNames[row.id]}
							disabled={isAddPending(row)}
							onkeydown={(event) => {
								if (event.key === 'Enter') addNewTag(row);
							}}
						/>
						<button
							class="btn join-item btn-sm"
							disabled={isAddPending(row) || !(newTagNames[row.id] ?? '').trim()}
							onclick={() => addNewTag(row)}
						>
							{isAddPending(row) ? 'Adding' : 'Add'}
						</button>
					</div>
				</footer>
			</aside>
		</article>
	{/each}
</section>

{#if lightboxSrc}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 h-full w-full bg-black/80"
			onclick={closeLightbox}
			aria-label="Close fullscreen"
		></button>
		<button
			class="btn absolute top-4 right-4 btn-circle btn-ghost text-xl text-white"
			onclick={closeLightbox}
			aria-label="Close fullscreen"
		>
			✕
		</button>
		<img
			src={lightboxSrc}
			alt="Fullscreen view"
			class="relative max-h-full max-w-full rounded-lg object-contain shadow-2xl"
		/>
	</div>
{/if}
