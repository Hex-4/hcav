<script lang="ts">
import { page } from '$app/state';
</script>

<svelte:head><title>paperwork interrupted · hcav</title></svelte:head>
<div class="mx-auto max-w-145 py-20 sm:py-28">
	<p class="text-hcav">request {page.status}</p>
	<h1 class="mt-3 text-5xl leading-tight font-bold">the paperwork has hit a snag.</h1>
	<p class="mt-6 text-xl text-neutral-600">{page.error?.message}</p>
	<div class="mt-8 flex flex-wrap gap-6">
		<a href="/" class="underline underline-offset-4">back to hcav</a
		><a href="/auth/login" class="underline underline-offset-4">start a new sign-in</a>
	</div>
</div>
