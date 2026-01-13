import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { Webhook } from 'svix';

export const prerender = false;

type ResendEmailReceivedEvent = {
    type: 'email.received' | string;
    created_at?: string;
    data?: {
        email_id?: string;
        from?: string;
        to?: string[];
        subject?: string;
    };
};

function safeKeyPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function getReceivedEmailFromResend(emailId: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('Missing RESEND_API_KEY');
    }

    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to retrieve received email (${response.status}): ${text}`);
    }

    return response.json();
}

function classifyToAddress(to: string[] | undefined) {
    const recipients = (to ?? []).map((x) => x.toLowerCase());
    if (recipients.includes('feedback@fossilgeo.uk')) return 'feedback';
    if (recipients.includes('errors@fossilgeo.uk')) return 'errors';
    return 'other';
}

export const POST: APIRoute = async ({ request }) => {
    const payload = await request.text();

    const svixId = request.headers.get('svix-id') ?? '';
    const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
    const svixSignature = request.headers.get('svix-signature') ?? '';

    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return new Response('Server misconfigured: missing RESEND_WEBHOOK_SECRET', { status: 500 });
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response('Missing svix headers', { status: 400 });
    }

    let event: ResendEmailReceivedEvent;
    try {
        const wh = new Webhook(webhookSecret);
        const verified = wh.verify(payload, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature
        });

        event = verified as ResendEmailReceivedEvent;
    } catch {
        return new Response('Invalid webhook signature', { status: 400 });
    }

    if (event.type !== 'email.received') {
        return new Response(JSON.stringify({ ignored: true, type: event.type }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
        return new Response('Bad payload: missing data.email_id', { status: 400 });
    }

    const category = classifyToAddress(event.data?.to);

    // Webhook payload does not include body/headers; fetch full content via the Receiving API.
    const receivedEmail = await getReceivedEmailFromResend(emailId);

    const store = getStore('support-emails');
    const timestamp = safeKeyPart(new Date().toISOString());
    const key = `${timestamp}_${safeKeyPart(category)}_${safeKeyPart(emailId)}`;

    await store.setJSON(key, {
        category,
        event,
        receivedEmail
    });

    return new Response(JSON.stringify({ stored: true, key, category }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};
