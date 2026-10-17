<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteFlow, Background, Controls, useSvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import {
		MAX_BOARD_ITEMS,
		MAX_ZOOM,
		MIN_ZOOM,
		parseBoardName,
		type Board,
		type BoardViewport
	} from '$lib/moodboard';
	import { getResponseErrorMessage } from '$lib/client/http';
	import { toast } from '$lib/toasts';
	import type { ImageCursor, Tag } from '../../../types';
	import BoardImage from './BoardImage.svelte';
	import ImageLibrary from './ImageLibrary.svelte';
	import { IMAGE_DRAG_TYPE, type ImageNode, type LibraryImage } from './types';

	let {
		initialBoard,
		initialImages,
		tags
	}: {
		initialBoard: Board;
		initialImages: { items: LibraryImage[]; nextCursor: ImageCursor | null };
		tags: Tag[];
	} = $props();
	const boardId = untrack(() => initialBoard.id);
	const nodeTypes = { image: BoardImage };
	const { screenToFlowPosition, fitView } = useSvelteFlow<ImageNode>();
	let name = $state(untrack(() => initialBoard.name));
	let revision = untrack(() => initialBoard.revision);
	let viewport = $state<BoardViewport>(untrack(() => ({ ...initialBoard.viewport })));
	let nodes = $state.raw<ImageNode[]>(
		untrack(() =>
			initialBoard.items.map((item) => ({
				id: item.id,
				type: 'image' as const,
				position: { x: item.x, y: item.y },
				width: item.width,
				height: item.height,
				zIndex: item.z_index,
				data: { imageId: item.image_id, imageName: item.image_name }
			}))
		)
	);
	let boardElement: HTMLDivElement;
	let fileInput: HTMLInputElement;
	let showLibrary = $state(true);
	let libraryRefresh = $state(0);
	let ready = $state(false);
	let saving = $state(false);
	let uploads = $state(0);
	let adding = $state(0);
	let failure = $state('');
	let conflict = $state(false);
	let dragOver = $state(false);
	let allowLeave = false;
	let pendingSave: Promise<boolean> | null = null;

	const snapshot = $derived(
		JSON.stringify({
			name,
			viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
			items: nodes.map((node) => ({
				id: node.id,
				image_id: node.data.imageId,
				x: node.position.x,
				y: node.position.y,
				width: node.width ?? 240,
				height: node.height ?? 240,
				z_index: node.zIndex ?? 0
			}))
		})
	);
	let savedSnapshot = $state(untrack(() => snapshot));
	const dirty = $derived(snapshot !== savedSnapshot);
	const busy = $derived(uploads > 0 || adding > 0);
	const selected = $derived(nodes.filter((node) => node.selected));

	onMount(() => {
		showLibrary = window.matchMedia('(min-width: 768px)').matches;
	});

	async function save(): Promise<boolean> {
		if (pendingSave) {
			const success = await pendingSave;
			return success ? save() : false;
		}
		if (conflict) return false;
		if (!dirty) {
			failure = '';
			return true;
		}
		const captured = snapshot;
		try {
			parseBoardName(name);
		} catch (cause) {
			failure = (cause as Error).message;
			return false;
		}
		saving = true;
		failure = '';
		pendingSave = (async () => {
			try {
				const response = await fetch(`/api/moodboards/${boardId}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ ...JSON.parse(captured), revision }),
					signal: AbortSignal.timeout(15000)
				});
				if (!response.ok) {
					conflict = response.status === 409 || response.status === 404;
					throw new Error(
						await getResponseErrorMessage(response, 'Could not save board. Please retry.')
					);
				}
				const result = await response.json();
				revision = result.revision;
				savedSnapshot = captured;
				return true;
			} catch (cause) {
				failure = cause instanceof Error ? cause.message : 'Could not save board. Please retry.';
				return false;
			} finally {
				saving = false;
				pendingSave = null;
			}
		})();
		return pendingSave;
	}

	$effect(() => {
		if (!ready || !dirty || saving || failure || busy) return;
		// Reading the snapshot also resets this timer when another edit occurs.
		void snapshot;
		const timeout = setTimeout(() => {
			void save();
		}, 800);
		return () => clearTimeout(timeout);
	});

	beforeNavigate((navigation) => {
		if (allowLeave || (!dirty && !busy && !saving)) return;
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		navigation.cancel();
		if (busy) {
			toast.info('Wait for images to finish adding before leaving the board.');
			return;
		}
		if (navigation.to) {
			const destination = navigation.to.url;
			void save().then(async (success) => {
				// The router supplied this already resolved destination.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				if (success) await goto(destination, { invalidateAll: true });
			});
		}
	});

	function reloadSaved() {
		if (window.confirm('Reload the saved board? Unsaved changes in this tab will be discarded.')) {
			allowLeave = true;
			window.location.reload();
		}
	}

	function center() {
		const bounds = boardElement.getBoundingClientRect();
		return screenToFlowPosition({
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height / 2
		});
	}

	async function imageSize(image: LibraryImage) {
		const img = new Image();
		img.src = `/api${image.name}`;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				img.decode(),
				new Promise((_, reject) => {
					timeout = setTimeout(() => reject(new Error('Image loading timed out.')), 10000);
				})
			]);
		} catch {
			/* An unavailable image still gets a removable placement. */
		} finally {
			clearTimeout(timeout);
		}
		const width = img.naturalWidth || 240;
		const height = img.naturalHeight || 240;
		const scale = Math.min(280 / width, 280 / height, 1);
		return { width: Math.max(1, width * scale), height: Math.max(1, height * scale) };
	}

	async function addImages(images: LibraryImage[], position = center()) {
		adding++;
		try {
			const placements = await Promise.all(
				images.map(async (image, index): Promise<ImageNode> => ({
					id: crypto.randomUUID(),
					type: 'image',
					data: { imageId: image.id, imageName: image.name },
					position: {
						x: position.x + (index % 4) * 300,
						y: position.y + Math.floor(index / 4) * 300
					},
					...(await imageSize(image)),
					selected: false
				}))
			);
			if (nodes.length + placements.length > MAX_BOARD_ITEMS) {
				toast.error(`A board can contain up to ${MAX_BOARD_ITEMS} images.`);
				return;
			}
			let layer = Math.max(0, ...nodes.map((node) => node.zIndex ?? 0));
			nodes = [...nodes, ...placements.map((node) => ({ ...node, zIndex: ++layer }))];
		} finally {
			adding--;
		}
	}

	async function upload(files: File[], position = center()) {
		if (!files.length) return;
		if (files.some((file) => !file.type.startsWith('image/') || !file.size)) {
			toast.error('Drop non-empty image files onto the board.');
			return;
		}
		if (nodes.length + files.length > MAX_BOARD_ITEMS) {
			toast.error(`A board can contain up to ${MAX_BOARD_ITEMS} images.`);
			return;
		}
		uploads++;
		try {
			const form = new FormData();
			files.forEach((file) => form.append('images', file));
			const response = await fetch('/api/images', {
				method: 'POST',
				headers: { accept: 'application/json' },
				body: form
			});
			if (!response.ok)
				throw new Error(await getResponseErrorMessage(response, 'Could not upload images.'));
			const result = await response.json();
			await addImages(result.items, position);
			libraryRefresh++;
			if (result.failed.length)
				toast.error(`${result.failed.length} image(s) failed to upload. Try those files again.`);
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : 'Could not upload images.');
		} finally {
			uploads--;
		}
	}

	async function drop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dragOver = false;
		if (!event.dataTransfer) return;
		const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		if (event.dataTransfer.files.length) {
			await upload([...event.dataTransfer.files], position);
			return;
		}
		try {
			const image = JSON.parse(event.dataTransfer.getData(IMAGE_DRAG_TYPE));
			if (
				!Number.isSafeInteger(image.id) ||
				image.id <= 0 ||
				typeof image.name !== 'string' ||
				!image.name.startsWith('/images/')
			)
				throw new Error();
			await addImages([image], position);
		} catch {
			toast.error('Drag an image from the library or drop an image file.');
		}
	}

	function removeSelected() {
		nodes = nodes.filter((node) => !node.selected);
	}
	function changeLayer(front: boolean) {
		const ordered = [...nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
		const reordered = front
			? [...ordered.filter((node) => !node.selected), ...ordered.filter((node) => node.selected)]
			: [...ordered.filter((node) => node.selected), ...ordered.filter((node) => !node.selected)];
		nodes = reordered.map((node, index) => ({ ...node, zIndex: index }));
	}

	function shortcut(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void save();
		}
	}
</script>

<svelte:window onkeydown={shortcut} />
<svelte:head><title>{name} · Moodboards</title></svelte:head>

<div
	class="flex h-full min-h-112 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100"
>
	<header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-base-300 p-3">
		<a class="btn btn-ghost btn-sm" href={resolve('/moodboards')}>← Boards</a>
		<input
			class="input min-w-32 flex-1 font-semibold sm:max-w-sm"
			aria-label="Board name"
			bind:value={name}
			maxlength="120"
		/>
		<span role="status" class="text-xs text-base-content/60" data-testid="save-status">
			{busy
				? 'Adding images…'
				: saving
					? 'Saving…'
					: failure
						? 'Not saved'
						: dirty
							? 'Unsaved changes'
							: 'Saved'}
		</span>
		<div class="ml-auto flex gap-2">
			<button
				class="btn btn-sm"
				aria-expanded={showLibrary}
				onclick={() => (showLibrary = !showLibrary)}>Library</button
			>
			<button class="btn btn-sm" disabled={!ready || busy} onclick={() => fileInput.click()}
				>Upload images</button
			>
			<button
				class="btn btn-primary btn-sm"
				disabled={saving || busy || !dirty || conflict}
				onclick={() => save()}>Save</button
			>
		</div>
		<input
			bind:this={fileInput}
			class="hidden"
			type="file"
			accept="image/*"
			multiple
			aria-label="Upload images to board"
			onchange={(event) => {
				const files = [...(event.currentTarget.files ?? [])];
				event.currentTarget.value = '';
				void upload(files);
			}}
		/>
	</header>
	{#if failure}
		<div
			role="alert"
			class="flex flex-wrap items-center gap-3 border-b border-error/30 bg-error/10 px-4 py-2 text-sm"
		>
			<p class="flex-1">{failure}</p>
			{#if !conflict}<button class="btn btn-sm" disabled={saving} onclick={() => save()}
					>Retry save</button
				>{/if}
			<button class="btn btn-ghost btn-sm" onclick={reloadSaved}>Reload saved board</button>
		</div>
	{/if}
	<div class="relative flex min-h-0 flex-1">
		{#if showLibrary}
			<aside
				class="absolute inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-base-300 bg-base-100 shadow-lg md:static md:shadow-none"
				aria-label="Image library"
			>
				<ImageLibrary
					refresh={libraryRefresh}
					{initialImages}
					{tags}
					onadd={(image) => {
						void addImages([image]);
					}}
				/>
			</aside>
		{/if}
		<div
			bind:this={boardElement}
			role="region"
			aria-label="Moodboard canvas"
			class="relative min-w-0 flex-1"
			ondragover={(event) => {
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
				dragOver = true;
			}}
			ondragleave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null))
					dragOver = false;
			}}
			ondrop={drop}
		>
			<SvelteFlow
				bind:nodes
				bind:viewport
				{nodeTypes}
				minZoom={MIN_ZOOM}
				maxZoom={MAX_ZOOM}
				nodesConnectable={false}
				edgesFocusable={false}
				zoomOnScroll
				zoomOnDoubleClick={false}
				deleteKey={['Backspace', 'Delete']}
				zIndexMode="manual"
				oninit={() => (ready = true)}
			>
				<Background />
				<Controls showLock={false} fitViewOptions={{ padding: 0.2, maxZoom: 1 }} />
			</SvelteFlow>
			{#if !nodes.length}
				<div
					class="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center"
				>
					<div class="max-w-sm rounded-box bg-base-100/90 p-6">
						<h2 class="text-xl font-semibold">Make room for inspiration</h2>
						<p class="mt-3 text-sm text-base-content/60">
							Drop images from your computer or drag them from the library. Arrange them anywhere.
						</p>
					</div>
				</div>
			{/if}
			{#if dragOver}<div
					class="pointer-events-none absolute inset-1 z-30 flex items-center justify-center rounded-box border-2 border-dashed border-primary bg-primary/10"
				>
					<span class="rounded-box bg-base-100 px-4 py-2 font-medium">Drop images here</span>
				</div>{/if}
		</div>
	</div>
	<footer
		class="flex shrink-0 flex-wrap items-center gap-2 border-t border-base-300 px-3 py-2 text-xs"
	>
		<span class="text-base-content/60"
			>{nodes.length}
			{nodes.length === 1 ? 'image' : 'images'} · {Math.round(viewport.zoom * 100)}%</span
		>
		<span class="hidden text-base-content/60 lg:inline"
			>Scroll to zoom · Drag background to pan · Shift-drag to select</span
		>
		<div class="ml-auto flex flex-wrap gap-1">
			{#if selected.length}
				<button class="btn btn-ghost btn-xs" onclick={() => changeLayer(false)}>Send to back</button
				>
				<button class="btn btn-ghost btn-xs" onclick={() => changeLayer(true)}
					>Bring to front</button
				>
				<button class="btn btn-ghost text-error btn-xs" onclick={removeSelected}
					>Remove selected</button
				>
			{/if}
			<button
				class="btn btn-ghost btn-xs"
				disabled={!nodes.length || !ready}
				onclick={() => fitView({ padding: 0.2, maxZoom: 1 })}>Fit all</button
			>
		</div>
	</footer>
</div>
