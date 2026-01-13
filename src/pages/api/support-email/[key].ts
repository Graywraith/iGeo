import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
    const adminToken = process.env.SUPPORT_EMAILS_ADMIN_TOKEN;
    if (adminToken) {
        const auth = request.headers.get('authorization') ?? '';
        if (auth !== `Bearer ${adminToken}`) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    const key = params.key;
    if (!key) {
        return new Response('Bad Request', { status: 400 });
    }

    const store = getStore('support-emails');
    const blob = await store.get(key, { type: 'json' });

    return new Response(JSON.stringify({ blob }), {
        headers: { 'content-type': 'application/json' }
    });
};
