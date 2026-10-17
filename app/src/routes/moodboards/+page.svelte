<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getResponseErrorMessage } from '$lib/client/http';
	import { toast } from '$lib/toasts';
	import type { BoardSummary } from '$lib/moodboard';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let name = $state('');
	let creating = $state(false);
	let deleting = $state(false);
	let deleteTarget: BoardSummary | null = $state(null);
	let deleteDialog: HTMLDialogElement;

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating || !name.trim()) return;
		creating = true;
		try {
			const response = await fetch('/api/moodboards', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!response.ok)
				throw new Error(await getResponseErrorMessage(response, 'Could not create board.'));
			const board = await response.json();
			await goto(resolve('/moodboards/[id]', { id: board.id }));
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : 'Could not create board.');
		} finally {
			creating = false;
		}
	}

	async function remove() {
		if (!deleteTarget || deleting) return;
		deleting = true;
		try {
			const response = await fetch(`/api/moodboards/${deleteTarget.id}`, { method: 'DELETE' });
			if (!response.ok)
				throw new Error(await getResponseErrorMessage(response, 'Could not delete board.'));
			deleteDialog.close();
			deleteTarget = null;
			await invalidateAll();
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : 'Could not delete board.');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>Moodboards · Croquis</title></svelte:head>

<section class="mx-auto flex max-w-6xl flex-col gap-8">
	<div>
		<h1 class="text-3xl font-semibold">Moodboards</h1>
		<p class="mt-2 text-base-content/65">Collect references and arrange them your way.</p>
	</div>
	<form onsubmit={create} class="flex flex-wrap items-end gap-3">
		<label class="flex min-w-56 flex-1 flex-col gap-2 sm:max-w-sm">
			<span class="text-sm font-medium">New board name</span>
			<input
				class="input w-full"
				bind:value={name}
				maxlength="120"
				required
				placeholder="e.g. Gesture studies"
			/>
		</label>
		<button class="btn btn-primary" disabled={creating || !name.trim()}>
			{creating ? 'Creating…' : 'Create board'}
		</button>
	</form>
	{#if data.boards.length}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.boards as board (board.id)}
				<article class="card border border-base-300 bg-base-100">
					<div class="card-body gap-4">
						<a
							class="text-xl font-semibold break-words link-hover"
							href={resolve('/moodboards/[id]', { id: board.id })}>{board.name}</a
						>
						<p class="text-sm text-base-content/60">
							{board.item_count}
							{board.item_count === 1 ? 'image' : 'images'} · Updated {new Date(
								board.updated_at
							).toLocaleDateString()}
						</p>
						<div class="card-actions justify-between">
							<a class="btn btn-outline btn-sm" href={resolve('/moodboards/[id]', { id: board.id })}
								>Open board</a
							>
							<button
								class="btn btn-ghost text-error btn-sm"
								aria-label={`Delete ${board.name}`}
								onclick={() => {
									deleteTarget = board;
									deleteDialog.showModal();
								}}>Delete</button
							>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="rounded-box border border-dashed border-base-300 px-6 py-16 text-center">
			<h2 class="text-lg font-medium">Your first collection starts here</h2>
			<p class="mt-2 text-base-content/60">
				Name a board above, then drag in images from your library or computer.
			</p>
		</div>
	{/if}
</section>

<dialog
	bind:this={deleteDialog}
	class="modal"
	oncancel={(event) => {
		if (deleting) event.preventDefault();
	}}
>
	<div class="modal-box">
		<h2 class="text-lg font-semibold">Delete “{deleteTarget?.name}”?</h2>
		<p class="py-4">This deletes the board and its layout. Images stay in your library.</p>
		<div class="modal-action">
			<button class="btn" disabled={deleting} onclick={() => deleteDialog.close()}>Cancel</button>
			<button class="btn btn-error" disabled={deleting} onclick={remove}
				>{deleting ? 'Deleting…' : 'Delete board'}</button
			>
		</div>
	</div>
</dialog>
