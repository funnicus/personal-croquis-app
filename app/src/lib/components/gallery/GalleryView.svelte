<script lang="ts">
	import type { Row } from '../../../types';

	export let rows: Row[];
	export let lightboxSrc: string | null;
	export let openLightbox: (href: string) => void;
	export let closeLightbox: () => void;
</script>

<section class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 xl:gap-8">
	{#each rows as item (item.name)}
		<button
			class="cursor-pointer border-0 bg-transparent p-0"
			onclick={() => openLightbox(`/api${item.name}`)}
			aria-label={`View ${item.name} fullscreen`}
		>
			<img
				src={`/api${item.name}`}
				alt={item.name}
				loading="lazy"
				decoding="async"
				class="transition-opacity duration-200 hover:opacity-80"
			/>
		</button>
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
