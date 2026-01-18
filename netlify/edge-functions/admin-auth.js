function getEnv(name) {
    try {
        if (globalThis.Netlify?.env && typeof globalThis.Netlify.env.get === 'function') {
            const value = globalThis.Netlify.env.get(name);
            return value ?? undefined;
        }
    } catch {
        // ignore
    }

    try {
        // Netlify Edge Functions run on Deno
        if (typeof Deno !== 'undefined' && Deno?.env && typeof Deno.env.get === 'function') {
            const value = Deno.env.get(name);
            return value ?? undefined;
        }
    } catch {
        // ignore
    }

    return undefined;
}

const SESSION_COOKIE_NAME = 'admin_session';

function base64UrlEncode(bytes) {
    const binary = String.fromCharCode(...bytes);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(value) {
    const padded = value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toUtf8Bytes(value) {
    return new TextEncoder().encode(value);
}

function parseCookies(headerValue) {
    const cookies = {};
    if (!headerValue) return cookies;
    for (const part of headerValue.split(';')) {
        const [rawName, ...rest] = part.trim().split('=');
        if (!rawName) continue;
        cookies[rawName] = rest.join('=');
    }
    return cookies;
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return result === 0;
}

async function hmacSignBase64Url(secret, message) {
    const key = await crypto.subtle.importKey('raw', toUtf8Bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, toUtf8Bytes(message));
    return base64UrlEncode(new Uint8Array(sig));
}

async function createSessionToken({ secret, username, ttlSeconds }) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = { u: username, exp };
    const payloadB64 = base64UrlEncode(toUtf8Bytes(JSON.stringify(payload)));
    const sigB64 = await hmacSignBase64Url(secret, payloadB64);
    return `${payloadB64}.${sigB64}`;
}

async function verifySessionToken({ secret, token }) {
    if (!token || !token.includes('.')) return { ok: false };
    const [payloadB64, sigB64] = token.split('.', 2);
    if (!payloadB64 || !sigB64) return { ok: false };

    const expectedSigB64 = await hmacSignBase64Url(secret, payloadB64);
    if (!timingSafeEqual(expectedSigB64, sigB64)) return { ok: false };

    let payload;
    try {
        const payloadJson = new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64));
        payload = JSON.parse(payloadJson);
    } catch {
        return { ok: false };
    }

    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false };

    return { ok: true, username: String(payload?.u ?? '') };
}

function redirect(location, extraHeaders = {}) {
    return new Response(null, {
        status: 303,
        headers: {
            Location: location,
            'Cache-Control': 'no-store',
            ...extraHeaders
        }
    });
}

function getConfiguredCredentials() {
    const configuredPair = getEnv('ADMIN_BASIC_AUTH');
    const configuredUser = getEnv('ADMIN_USER');
    const configuredPass = getEnv('ADMIN_PASS');

    let expectedUser;
    let expectedPass;

    if (configuredPair && configuredPair.includes(':')) {
        const splitIndex = configuredPair.indexOf(':');
        expectedUser = configuredPair.slice(0, splitIndex);
        expectedPass = configuredPair.slice(splitIndex + 1);
    } else if (configuredUser && configuredPass) {
        expectedUser = configuredUser;
        expectedPass = configuredPass;
    }

    return { expectedUser, expectedPass };
}

export default async (request, context) => {
    const { expectedUser, expectedPass } = getConfiguredCredentials();

    if (!expectedUser || !expectedPass) {
        return new Response('Admin auth is not configured. Set ADMIN_BASIC_AUTH (user:pass) or ADMIN_USER + ADMIN_PASS.', {
            status: 500,
            headers: { 'Cache-Control': 'no-store' }
        });
    }

    const sessionSecret = getEnv('ADMIN_SESSION_SECRET') ?? expectedPass;

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Allow the login screen to render.
    if (request.method === 'GET' && pathname === '/admin/login') {
        return context.next();
    }

    // Handle login submission.
    if (request.method === 'POST' && pathname === '/admin/login') {
        let form;
        try {
            form = await request.formData();
        } catch {
            form = new FormData();
        }

        const username = String(form.get('username') ?? '');
        const password = String(form.get('password') ?? '');
        const next = String(form.get('next') ?? '/admin/');

        if (username !== expectedUser || password !== expectedPass) {
            const nextParam = encodeURIComponent(next);
            return redirect(`/admin/login?error=1&next=${nextParam}`);
        }

        const token = await createSessionToken({ secret: sessionSecret, username, ttlSeconds: 60 * 60 * 24 * 7 });
        const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;

        return redirect(next.startsWith('/admin/') ? next : '/admin/', { 'Set-Cookie': cookie });
    }

    // Logout: clear cookie.
    if (request.method === 'GET' && pathname === '/admin/logout') {
        const cookie = `${SESSION_COOKIE_NAME}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
        return redirect('/admin/login', { 'Set-Cookie': cookie });
    }

    // Protect everything else under /admin.
    const cookies = parseCookies(request.headers.get('cookie'));
    const token = cookies[SESSION_COOKIE_NAME];
    const verified = await verifySessionToken({ secret: sessionSecret, token });
    if (!verified.ok) {
        const next = encodeURIComponent(`${pathname}${url.search}`);
        return redirect(`/admin/login?next=${next}`);
    }

    return context.next();
};

export const config = {
    path: '/admin/*'
};
