import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const publicDir = path.join(projectRoot, 'public');
const sourcePng = path.join(publicDir, 'favicon.png');

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function writePng({ size, outFile, fit = 'contain' }) {
    const outPath = path.join(publicDir, outFile);
    await sharp(sourcePng)
        .resize(size, size, {
            fit,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outPath);
}

async function main() {
    if (!(await fileExists(sourcePng))) {
        throw new Error(`Missing source icon: ${sourcePng}`);
    }

    // Common PNG sizes
    await writePng({ size: 16, outFile: 'favicon-16.png' });
    await writePng({ size: 32, outFile: 'favicon-32.png' });
    await writePng({ size: 48, outFile: 'favicon-48.png' });

    // Apple touch
    await writePng({ size: 180, outFile: 'apple-touch-icon.png', fit: 'cover' });

    // Android / PWA
    await writePng({ size: 192, outFile: 'android-chrome-192.png', fit: 'cover' });
    await writePng({ size: 512, outFile: 'android-chrome-512.png', fit: 'cover' });

    // Windows tiles
    await writePng({ size: 150, outFile: 'mstile-150.png', fit: 'cover' });

    // favicon.ico (multi-size)
    const icoPngs = await Promise.all(
        [16, 32, 48].map(async (size) => {
            return sharp(sourcePng)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
        })
    );

    const icoBuffer = await pngToIco(icoPngs);
    await fs.writeFile(path.join(publicDir, 'favicon.ico'), icoBuffer);

    // site.webmanifest (Layout links to /site.webmanifest)
    const webmanifest = {
        name: 'Fossil Geo',
        short_name: 'FossilGeo',
        description: 'Geographic and geological information, primarily focused on the United Kingdom.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#355c7d',
        background_color: '#030712',
        icons: [
            {
                src: '/android-chrome-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
            },
            {
                src: '/android-chrome-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
            }
        ]
    };

    await fs.writeFile(path.join(publicDir, 'site.webmanifest'), JSON.stringify(webmanifest, null, 4) + '\n', 'utf8');

    // browserconfig.xml (Windows pinned tiles)
    const browserConfigXml = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/mstile-150.png"/>
            <TileColor>#355c7d</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`;

    await fs.writeFile(path.join(publicDir, 'browserconfig.xml'), browserConfigXml, 'utf8');

    // Optional: keep a copy with common naming too
    await fs.copyFile(path.join(publicDir, 'favicon-16.png'), path.join(publicDir, 'favicon-16x16.png'));
    await fs.copyFile(path.join(publicDir, 'favicon-32.png'), path.join(publicDir, 'favicon-32x32.png'));

    console.log('Generated favicons into public/');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
