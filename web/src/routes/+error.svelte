<script lang="ts">
import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · HCAV</title></svelte:head>
<h1>Well. ({page.status})</h1>
<p>{page.error?.message}</p>
<p><a href="/">Back to HCAV</a> · <a href="/auth/login">Try signing in again</a></p>
