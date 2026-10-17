<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Bars from '$lib/components/bars.svelte';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden">
	<div class="navbar shrink-0 bg-base-100 shadow-sm">
		<div class="navbar-start">
			<div class="dropdown">
				<div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
					<Bars />
				</div>
				<ul
					tabindex="-1"
					class="dropdown-content menu z-1 mt-3 w-52 menu-sm rounded-box bg-base-100 p-2 shadow"
				>
					<li><a href={resolve('/')}>✏️ Croquis</a></li>
					<li><a href={resolve('/gallery')}>🖼️ Gallery</a></li>
					<li><a href={resolve('/moodboards')}>📌 Moodboards</a></li>
					<li><a href={resolve('/tags')}>🏷️ Tags</a></li>
					<li><a href={resolve('/upload')}>📂 Upload</a></li>
				</ul>
			</div>
			<a href={resolve('/')} class="btn btn-ghost text-xl">Croquis Frontend</a>
		</div>
		<div class="navbar-center hidden lg:flex">
			<ul class="menu menu-horizontal px-1">
				<li><a href={resolve('/')}>✏️ Croquis</a></li>
				<li><a href={resolve('/gallery')}>🖼️ Gallery</a></li>
				<li><a href={resolve('/moodboards')}>📌 Moodboards</a></li>
				<li><a href={resolve('/tags')}>🏷️ Tags</a></li>
				<li><a href={resolve('/upload')}>📂 Upload</a></li>
			</ul>
		</div>
		<div class="navbar-end"></div>
	</div>

	<main class="min-h-0 flex-1 overflow-auto p-5">
		{@render children?.()}
	</main>
	<ToastHost />
</div>
