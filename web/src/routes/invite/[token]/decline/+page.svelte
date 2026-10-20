<script lang="ts">
import { enhance } from '$app/forms';
import type { PageProps } from './$types';

let { form }: PageProps = $props();
</script>

<svelte:head
	><title>stop invitations · hcav</title>
	<meta name="robots" content="noindex"></svelte:head
>
<div class="mx-auto max-w-145 py-20">
	<h1 class="text-4xl leading-tight font-bold">
		{form?.done ? 'request acknowledged.' : 'no more recruitment?'}
	</h1>
	{#if form?.done}
		<p role="status" class="mt-6">
			we will not send further invitations to this destination. an invitation already being
			delivered may still arrive.
		</p>
	{:else}
		<p class="mt-6 text-neutral-600">
			stop future hcav invitations to the email address or slack account that received this message.
			no sign-in required.
		</p>
		<form method="POST" use:enhance class="mt-8">
			<button
				type="submit"
				class="rounded-sm bg-black px-6 py-3 font-bold text-white hover:bg-neutral-800"
			>
				stop invitations
			</button>
		</form>
	{/if}
</div>
