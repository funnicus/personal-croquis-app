<script lang="ts">
	import { NodeResizer, type NodeProps } from '@xyflow/svelte';
	import type { ImageNode } from './types';
	let { data, selected }: NodeProps<ImageNode> = $props();
	let failed = $state(false);
</script>

<NodeResizer
	isVisible={selected}
	minWidth={40}
	minHeight={40}
	maxWidth={20000}
	maxHeight={20000}
	keepAspectRatio
/>
<div class="h-full w-full overflow-hidden rounded-sm bg-base-200 shadow-md" class:ring-2={selected}>
	{#if failed}
		<div
			class="flex h-full items-center justify-center p-4 text-center text-sm text-base-content/60"
		>
			Image unavailable
		</div>
	{:else}
		<img
			src={`/api${data.imageName}`}
			alt={data.imageName.split('/').pop() ?? 'Reference image'}
			draggable="false"
			decoding="async"
			class="h-full w-full object-contain select-none"
			onerror={() => (failed = true)}
		/>
	{/if}
</div>
