import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
    const adminToken = process.env.SUPPORT_EMAILS_ADMIN_TOKEN;
    if (adminToken) {
        const auth = request.headers.get('authorization') ?? '';
        if (auth !== `Bearer ${adminToken}`) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    const category = url.searchParams.get('category');
    const store = getStore({ name: 'support-emails', consistency: 'strong' });

    const { blobs } = await store.list();
    let keys = blobs.map((b) => b.key);

    if (category) {
        const suffix = `_${category}_`;
        keys = keys.filter((k) => k.includes(suffix));
    }

    // Newest-first if keys contain ISO timestamps at the start.
    keys.sort().reverse();

    return new Response(JSON.stringify({ keys }), {
        headers: { 'content-type': 'application/json' }
    });
};
