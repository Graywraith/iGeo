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
    const html = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>Authorization required</title>
        <style>
            :root {
                color-scheme: dark;
            }
            html, body {
                height: 100%;
                margin: 0;
            }
            body {
                font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                color: rgba(255, 255, 255, 0.9);
                background-color: #0b0f14;
                background:
                    radial-gradient(900px 600px at 20% 10%, rgba(53, 92, 125, 0.55), transparent 60%),
                    radial-gradient(800px 520px at 80% 30%, rgba(92, 49, 125, 0.45), transparent 55%),
                    linear-gradient(180deg, #0b0f14 0%, #0a0a0a 100%);
                display: grid;
                place-items: center;
            }
            .card {
                width: min(720px, calc(100% - 2.5rem));
                padding: 1.25rem 1.25rem;
                border-radius: 16px;
                background: rgba(0, 0, 0, 0.35);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(8px);
            }
            h1 {
                font-size: 1.1rem;
                margin: 0 0 0.5rem 0;
                font-weight: 650;
            }
            p {
                margin: 0;
                line-height: 1.5;
                color: rgba(255, 255, 255, 0.75);
            }
            code {
                color: rgba(255, 255, 255, 0.9);
            }
        </style>
    </head>
    <body>
        <main class="card" role="main">
            <h1>Sign in required</h1>
            <p>This area is protected. Your browser will prompt for a username and password.</p>
        </main>
    </body>
</html>`;

    return new Response(html, {
        status: 401,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
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
