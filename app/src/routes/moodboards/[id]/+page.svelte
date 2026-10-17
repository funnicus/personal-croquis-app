<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import BoardEditor from '$lib/components/moodboard/BoardEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.board.id}
	<SvelteFlowProvider>
		<BoardEditor initialBoard={data.board} initialImages={data.images} tags={data.tags} />
	</SvelteFlowProvider>
{/key}
