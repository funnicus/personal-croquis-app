<script lang="ts">
	import type { Row, Tag } from '../../../types';
	import { getDisplayTag, type TagGroup } from '$lib/tag-display';
	import EditTagsButton from './EditTagsButton.svelte';
	import { getResponseErrorMessage } from '$lib/client/http';
	import { toast } from '$lib/toasts';
	import clientTagService from '$lib/client/tagService';

	type Props = {
		rows: Row[];
		tags: Tag[];
		groupedTags: TagGroup[];
	};

	let { rows, tags, groupedTags }: Props = $props();

	let deletingImages: string[] = $state([]);
	let pendingAddRows: number[] = $state([]);
	let pendingTagKeys: string[] = $state([]);

	const rowTagNameSets = $derived(
		new Map(rows.map((row) => [row.id, new Set(row.tags.map((tag) => tag.name))]))
	);
	const isTagPending = (row: Row, tag: string) => pendingTagKeys.includes(tagKey(row, tag));
	const tagKey = (row: Row, tag: string) => `${row.id}:${tag}`;
	const isAddPending = (row: Row) => pendingAddRows.includes(row.id);
	const isDeletePending = (name: string) => deletingImages.includes(name);

	function formatDate(d: Date | string) {
		return new Intl.DateTimeFormat(undefined, {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(d));
	}

	const remove = async (name: string) => {
		if (isDeletePending(name)) return;
		deletingImages = [...deletingImages, name];

		try {
			const result = await fetch(`/api${name}`, {
				method: 'DELETE'
			});

			if (!result.ok) {
				toast.error(await getResponseErrorMessage(result, 'Failed to delete image'));
				return;
			}

			rows = rows.filter((r) => r.name !== name);
		} finally {
			deletingImages = deletingImages.filter((item) => item !== name);
		}
	};

	// toggle a tag on a row
	const toggleTag = async (row: Row, tag: string) => {
		if (row.tags.map((t) => t.name).includes(tag)) {
			await removeTag(row, tag);
		} else {
			await addNewTag(row, tag);
		}
	};

	// add a brand-new tag (to the row + notify parent to add globally)
	const addNewTag = async (row: Row, value: string) => {
		const tagName = value.trim();
		if (!tagName || isAddPending(row)) return;
		pendingAddRows = [...pendingAddRows, row.id];

		try {
			const result = await clientTagService.addNewTagToImage(row.name, tagName);
			if (!result.ok) {
				toast.error(result.message);
				return;
			}

			rows = rows.map((r) => {
				if (r.id === row.id) {
					return { ...r, tags: [...r.tags, { id: -1, name: tagName }] };
				}
				return r;
			});

			if (!tags.map((t) => t.name).includes(tagName)) {
				tags = [...tags, { id: -1, name: tagName }];
			}
		} finally {
			pendingAddRows = pendingAddRows.filter((id) => id !== row.id);
		}
	};

	const removeTag = async (row: Row, tag: string) => {
		const key = tagKey(row, tag);
		if (pendingTagKeys.includes(key)) return;
		pendingTagKeys = [...pendingTagKeys, key];

		try {
			const result = await clientTagService.removeTagFromImage(row.name, tag);
			if (!result.ok) {
				toast.error(result.message);
				return;
			}

			rows = rows.map((r) => {
				if (r.id === row.id) {
					return { ...r, tags: r.tags.filter((t) => t.name !== tag) };
				}
				return r;
			});
		} finally {
			pendingTagKeys = pendingTagKeys.filter((item) => item !== key);
		}
	};
</script>

<div>
	<table class="table w-full table-zebra">
		<thead>
			<tr>
				<th class="w-16">Image</th>
				<th>Name</th>
				<th class="whitespace-nowrap">Uploaded at</th>
				<th class="w-68 text-center">Actions</th>
			</tr>
		</thead>

		<tbody>
			{#each rows as row (row.id)}
				<tr>
					<!-- Image -->
					<td>
						<div class="avatar">
							<div class="mask h-12 w-12 mask-squircle">
								<img
									src={`/api${row.name}`}
									alt={`${row.name} thumbnail`}
									aria-label={`${row.name} thumbnail`}
									loading="lazy"
									decoding="async"
								/>
							</div>
						</div>
					</td>

					<td>
						<span>{row.name.split('/images/').pop()}</span>
						{#if row.tags.length}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each row.tags as tag (tag.name)}
									{@const displayTag = getDisplayTag(tag)}
									<span class="badge badge-outline badge-sm" title={tag.name}>
										{displayTag.categoryLabel}: {displayTag.label}
									</span>
								{/each}
							</div>
						{/if}
					</td>

					<!-- Uploaded at -->
					<td class="text-sm text-base-content/70">
						{formatDate(row.uploaded_at as Date)}
					</td>

					<!-- Delete -->
					<td class="text-center">
						<EditTagsButton
							{groupedTags}
							{row}
							rowTagNames={rowTagNameSets.get(row.id) ?? new Set()}
							{toggleTag}
							{addNewTag}
							{isTagPending}
							{isAddPending}
						/>
						<button
							class="btn btn-error btn-sm"
							onclick={() => remove(row.name)}
							disabled={isDeletePending(row.name)}
							aria-label="Delete row"
							title="Delete"
						>
							{isDeletePending(row.name) ? 'Deleting' : 'Delete'}
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
