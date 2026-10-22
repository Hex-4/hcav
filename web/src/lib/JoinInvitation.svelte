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
</script>

<svelte:head
	><title>Join {teamName} · HCAV</title>
	<meta name="robots" content="noindex"></svelte:head
>

<h1>{teamName}</h1>
<p>You’ve been invited to a HCAV teamName. Presumably on purpose.</p>
{#if message}
	<p role="status">{message}</p>
{/if}
{#if user}
	{#if currentTeam}
		<p>You’re already on {currentTeam}. Leave your current team before joining a different one.</p>
		<p><a href="/team">Your team</a></p>
	{:else}
		<form method="POST" use:enhance><button type="submit">Join this team</button></form>
	{/if}
{:else}
	<p>
		<a href={`/auth/login?next=${encodeURIComponent(next)}`}>Sign in with Hack Club</a>
		to join.
	</p>
  <p><b>What is this?</b>HCAV is the world's second best scavenger hunt. <a href="/">Learn more?</a></p>
{/if}
