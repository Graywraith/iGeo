import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { Webhook } from 'svix';

export const prerender = false;

type ResendEmailReceivedEvent = {
    type: 'email.received' | string;
    created_at?: string;
    data?: {
        attachments?: unknown[];
        bcc?: string[];
        cc?: string[];
        email_id?: string;
        from?: string;
        message_id?: string;
        to?: string[];
        subject?: string;
    };
};

function safeKeyPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {})
        }
    });
}

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

async function getReceivedEmailFromResend(emailId: string, apiKey: string) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        const message = text ? text.slice(0, 2000) : '(no response body)';
        throw new Error(`Resend Receiving API error (${response.status}): ${message}`);
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
    try {
        const payload = await request.text();

        const svixId = request.headers.get('svix-id') ?? '';
        const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
        const svixSignature = request.headers.get('svix-signature') ?? '';

        const webhookSecret = getRequiredEnv('RESEND_WEBHOOK_SECRET');

        if (!svixId || !svixTimestamp || !svixSignature) {
            return jsonResponse({ error: 'Missing svix headers' }, { status: 400 });
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
            return jsonResponse({ error: 'Invalid webhook signature' }, { status: 400 });
        }

        if (event.type !== 'email.received') {
            return jsonResponse({ ignored: true, type: event.type }, { status: 200 });
        }

        const emailId = event.data?.email_id;
        if (!emailId) {
            return jsonResponse({ error: 'Bad payload: missing data.email_id' }, { status: 400 });
        }

        const apiKey = getRequiredEnv('RESEND_API_KEY');
        const category = classifyToAddress(event.data?.to);

        // Webhook payload does not include body/headers; fetch full content via the Receiving API.
        const receivedEmail = await getReceivedEmailFromResend(emailId, apiKey);

        const store = getStore({ name: 'support-emails', consistency: 'strong' });
        const timestamp = safeKeyPart(new Date().toISOString());
        const key = `${timestamp}_${safeKeyPart(category)}_${safeKeyPart(emailId)}`;

        await store.setJSON(key, {
            category,
            event,
            receivedEmail
        });

        // Send alert email to private address using Resend
        const alertRecipient = 'noake.richard@gmail.com';
        const alertSubject = `iGeo: New email received (${category})`;
        const alertBody = `A new email was received in iGeo.\n\nFrom: ${event.data?.from}\nTo: ${(event.data?.to ?? []).join(', ')}\nSubject: ${event.data?.subject}\n\nEmail ID: ${emailId}\nCategory: ${category}\n\nView details in your admin panel.`;

        // Send via Resend API
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'noreply@fossilgeo.uk',
                to: alertRecipient,
                subject: alertSubject,
                text: alertBody
            })
        });

        return jsonResponse({ stored: true, key, category, alertSent: true }, { status: 200 });
    } catch (error) {
        console.error('[resend][inbound] handler failed', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResponse({ error: 'Internal Server Error', message }, { status: 500 });
    }
};
