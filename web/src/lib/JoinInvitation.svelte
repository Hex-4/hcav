<script lang="ts">
import { enhance } from '$app/forms';

let {
	teamName,
	currentTeam,
	next,
	user,
	message
}: {
	teamName: string;
	currentTeam: string;
	next: string;
	user: { name: string } | null;
	message?: string;
} = $props();
let busy = $state(false);
</script>

<svelte:head
	><title>you have been recruited · hcav</title>
	<meta name="robots" content="noindex"></svelte:head
>
<div class="mx-auto max-w-150 py-16 sm:py-24">
	<p class="text-hcav">you have been recruited.</p>
	<h1 class="mt-4 text-5xl leading-tight font-bold tracking-tight break-words sm:text-6xl">
		{teamName}
	</h1>
	<p class="mt-6 text-xl text-neutral-600">
		would like your assistance with a series of unreasonable requests.
	</p>
	<p class="mt-4">hcav. halloween weekend. october 30 – november 2, 2026.</p>
	{#if message}
		<p role="status" class="mt-6 border-l-2 border-hcav pl-4">{message}</p>
	{/if}
	{#if user}
		<p class="mt-8 text-neutral-600">signed in as {user.name}.</p>
		{#if currentTeam}
			<p class="mt-3 text-neutral-600">
				you currently belong to {currentTeam}. joining a different team requires leaving that one
				first.
			</p>
			<a href="/team" class="mt-3 inline-block underline underline-offset-4"
				>manage your current team</a
			>
		{/if}
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						busy = false;
					}
				};
			}}
			class="mt-6"
		>
			<button
				type="submit"
				disabled={busy}
				class="rounded-sm bg-hcav px-7 py-3 font-bold text-white hover:bg-[#a9271a] disabled:opacity-60"
			>
				{busy ? 'filing paperwork…' : 'join this team'}
			</button>
		</form>
	{:else}
		<a
			href={`/auth/login?next=${encodeURIComponent(next)}`}
			class="mt-8 inline-flex rounded-sm bg-hcav px-7 py-3 font-bold text-white hover:bg-[#a9271a]"
			>sign in with hack club</a
		>
		<p class="mt-4 text-base text-neutral-600">
			signing in does not join the team. we will ask you first.
		</p>
	{/if}
</div>
