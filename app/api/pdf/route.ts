import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // seconds

/**
 * Fetch all external http(s) image URLs that appear in the HTML (src attributes and
 * background-image CSS) and replace them with inline base64 data URIs so Puppeteer
 * doesn't need to make any network requests.
 */
async function inlineExternalImages(html: string): Promise<string> {
  // Collect unique external URLs from:
  //   src="https://..." or src='https://...'
  //   url('https://...') or url("https://...")
  const urlPattern = /(?:src=["']|url\(["']?)(https?:\/\/[^"')>]+)(?:["']|\)|["']>)/g;
  const uniqueUrls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(html)) !== null) {
    uniqueUrls.add(m[1]);
  }

  if (uniqueUrls.size === 0) return html;

  // Fetch all in parallel
  const replacements = new Map<string, string>();
  await Promise.all(
    Array.from(uniqueUrls).map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') ?? 'image/png';
        const buf = await res.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        replacements.set(url, `data:${contentType};base64,${b64}`);
      } catch {
        // leave original URL if fetch fails
      }
    })
  );

  // Replace each URL with its data URI
  let result = html;
  for (const [url, dataUri] of replacements) {
    // Escape special regex chars in the URL
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), dataUri);
  }
  return result;
}

export async function POST(request: NextRequest) {
  let browser;
  try {
    const { html } = await request.json() as { html: string };
    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'html is required' }, { status: 400 });
    }

    // Pre-fetch all external images and inline them as base64 data URIs
    const inlinedHtml = await inlineExternalImages(html);

    // Lazy-load puppeteer so it stays server-only and doesn't affect client bundles
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // All assets are now inline base64 — domcontentloaded is sufficient
    await page.setContent(inlinedHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Generate PDF matching the print CSS (A4, no margin — all margins are in the HTML)
    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    }));

    await browser.close();
    browser = undefined;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="worksheets.pdf"',
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (err: any) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    console.error('[api/pdf] error:', err);
    return NextResponse.json({ error: 'PDF generation failed', details: err.message }, { status: 500 });
  }
}

