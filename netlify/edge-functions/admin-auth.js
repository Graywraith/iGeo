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

function parseBasicAuth(headerValue) {
    if (!headerValue) return undefined;

    const [scheme, value] = headerValue.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'basic' || !value) return undefined;

    let decoded;
    try {
        decoded = atob(value);
    } catch {
        return undefined;
    }

    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) return undefined;

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    return { username, password };
}

function unauthorized(realm = 'Admin') {
    return new Response('Unauthorized', {
        status: 401,
        headers: {
            'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
            'Cache-Control': 'no-store'
        }
    });
}

export default async (request, context) => {
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

    if (!expectedUser || !expectedPass) {
        return new Response('Admin auth is not configured. Set ADMIN_BASIC_AUTH (user:pass) or ADMIN_USER + ADMIN_PASS.', {
            status: 500,
            headers: { 'Cache-Control': 'no-store' }
        });
    }

    const auth = parseBasicAuth(request.headers.get('authorization'));
    if (!auth || auth.username !== expectedUser || auth.password !== expectedPass) {
        return unauthorized('Admin');
    }

    return context.next();
};

export const config = {
    path: '/admin/*'
};
