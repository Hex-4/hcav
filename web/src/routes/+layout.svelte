<script lang="ts">
import './layout.css';
import favicon from '#lib/assets/favicon.svg';
import { page } from '$app/state';
import type { LayoutProps } from './$types';

let { children, data }: LayoutProps = $props();
const isLanding = $derived(page.url.pathname === '/');
</script>

<svelte:head>
	<link rel="icon" href={favicon}>
	<meta name="theme-color" content="#ffffff">
	{#if !isLanding}
		<link
			rel="preload"
			href="/fonts/comic-neue-regular.ttf"
			as="font"
			type="font/ttf"
			crossorigin="anonymous"
		>
	{/if}
</svelte:head>

{#if isLanding}
	<main class="faq-page">{@render children()}</main>
{:else}
	<a
		href="#main"
		class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:p-3"
		>skip to content</a
	>
	<div class="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 sm:px-10">
		<header
			class="flex h-22 shrink-0 items-center justify-between gap-5 border-b border-neutral-200 sm:h-24"
		>
			<a href="/" class="text-3xl font-bold tracking-tight" aria-label="hcav home"
				>hcav<span class="text-hcav">.</span></a
			>
			<nav
				aria-label="main navigation"
				class="flex items-center gap-5 text-base sm:gap-9 sm:text-lg"
			>
				{#if data.user}
					<a href="/team" class="underline decoration-hcav decoration-2 underline-offset-6"
						>your team</a
					>
				{:else}
					<a href="/auth/login" class="underline decoration-hcav decoration-2 underline-offset-6"
						>sign in</a
					>
				{/if}
			</nav>
		</header>
		<main id="main" class="grow">{@render children()}</main>
		<footer
			class="mt-24 flex flex-col justify-between gap-4 border-t border-neutral-200 py-8 text-sm text-neutral-600 sm:flex-row sm:items-center"
		>
			<p>the organization of burlington, vermont.<br>building something important.</p>
			<div class="flex items-center gap-6">
				{#if data.user}
					<form method="POST" action="/auth/logout">
						<button type="submit" class="underline underline-offset-4 hover:text-black">
							sign out
						</button>
					</form>
				{:else}
					<span>for your safety.</span>
				{/if}
			</div>
		</footer>
	</div>
{/if}

<style>
:global(html:has(.faq-page)),
:global(body:has(.faq-page)),
.faq-page,
.faq-page :global(*) {
  font: revert;
}

.faq-page {
	max-width: 65ch;
	margin: 3rem auto;
	padding: 0 1rem;
}
</style>
