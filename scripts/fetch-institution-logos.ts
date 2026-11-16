// Downloads each registry brand's own site/app icon into public/institutions/
// and writes src/lib/wealth/logo-manifest.json. Run: npm run logos:fetch
//   --only key1,key2   refetch selected keys   --force   overwrite existing
// Downloaded bytes are treated as untrusted data: only verified raster
// images (PNG/JPEG/WEBP/ICO/GIF) are kept; SVG is skipped; nothing is executed.
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { institutions } from "../src/lib/wealth/institutions";
import {
  institutionApps,
  institutionDomains,
} from "../src/lib/wealth/institution-domains";

const OUT = "public/institutions";
const MANIFEST = "src/lib/wealth/logo-manifest.json";
const MAX_BYTES = 400 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const args = process.argv.slice(2);
const only = args.includes("--only")
  ? new Set(args[args.indexOf("--only") + 1]!.split(","))
  : null;
const force = args.includes("--force");
// Site icons reviewed and rejected (not the brand mark); keep the monogram.
// Sites whose largest icon is generic artwork rather than the brand mark.
const PREFER_APP = new Set(["union-bank"]);
const SKIP = new Set(["shriram-finance", "government-of-india"]);

async function get(url: string, accept: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3 * 1024 * 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return { url: response.url, body: Buffer.concat(chunks) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pixel width of PNG/ICO/GIF/WEBP(VP8X); 0 when unknown (e.g. JPEG). */
function width(b: Buffer, type: string) {
  if (type === "png") return b.readUInt32BE(16);
  if (type === "gif") return b.readUInt16LE(6);
  if (type === "ico") {
    let best = 0;
    for (let i = 0; i < b.readUInt16LE(4) && 6 + i * 16 < b.length; i++)
      best = Math.max(best, b[6 + i * 16] || 256);
    return best;
  }
  if (type === "webp" && b.subarray(12, 16).toString("latin1") === "VP8X")
    return 1 + b.readUIntLE(24, 3);
  return 64;
}
function imageType(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "webp";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "ico";
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  return null;
}

/** Icon candidates from <link> tags, best first (apple-touch, then largest). */
function candidates(html: string, base: string) {
  const found: { href: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel =
      /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || href.startsWith("data:") || /\.svg(\?|$)/i.test(href))
      continue;
    const sizes = /\bsizes\s*=\s*["']?(\d+)x(\d+)/i.exec(tag);
    const px = sizes ? Number(sizes[1]) : 0;
    const score = (rel.includes("apple-touch") ? 1000 : 0) + Math.min(px, 512);
    try {
      found.push({ href: new URL(href, base).toString(), score });
    } catch {
      /* ignore malformed */
    }
  }
  found.sort((a, b) => b.score - a.score);
  const origin = new URL(base).origin;
  return [
    ...found.map((f) => f.href),
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/android-chrome-192x192.png`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon-32x32.png`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
  ];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, string> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : {};
  const failed: string[] = [];
  for (const i of institutions) {
    if (only && !only.has(i.key)) continue;
    if (manifest[i.key] && !force) continue;
    if (SKIP.has(i.key)) continue;
    const domain = institutionDomains[i.key];
    const page = domain ? await get(`https://${domain}/`, "text/html") : null;
    const list = !domain
      ? []
      : page
        ? candidates(page.body.toString("utf8"), page.url)
        : [
            `https://${domain}/apple-touch-icon.png`,
            `https://${domain}/favicon.ico`,
          ];
    // Keep the sharpest verified image among the candidates.
    let best: { body: Buffer; type: string; px: number; url: string } | null =
      null;
    for (const url of [...new Set(list)]) {
      const icon = await get(url, "image/*");
      if (!icon || icon.body.length > MAX_BYTES) continue;
      const type = imageType(icon.body);
      if (!type) continue;
      const px = width(icon.body, type);
      if (!best || px > best.px) best = { body: icon.body, type, px, url };
      if (px >= 180) break;
    }
    // Fall back to the brand's official App Store icon when the site only
    // offers a small favicon. The listing's seller must match the brand.
    const app = institutionApps[i.key];
    if (app && (!best || best.px < 128 || PREFER_APP.has(i.key))) {
      const lookup = await get(
        `https://itunes.apple.com/lookup?id=${app.id}&country=in`,
        "application/json",
      );
      try {
        const result = JSON.parse(lookup?.body.toString("utf8") ?? "{}")
          .results?.[0];
        if (
          result?.sellerName
            ?.toLowerCase()
            .includes(app.seller.toLowerCase()) &&
          typeof result.artworkUrl512 === "string" &&
          new URL(result.artworkUrl512).hostname.endsWith(".mzstatic.com")
        ) {
          const icon = await get(result.artworkUrl512, "image/*");
          const type = icon && imageType(icon.body);
          if (icon && type && icon.body.length <= MAX_BYTES)
            best = {
              body: icon.body,
              type,
              px: 512,
              url: result.artworkUrl512,
            };
        } else console.log(`  ${i.key}: App Store seller mismatch, skipped`);
      } catch {
        /* keep the site icon */
      }
    }
    const saved = !!best;
    if (best) {
      for (const ext of ["png", "jpg", "webp", "ico", "gif"])
        rmSync(join(OUT, `${i.key}.${ext}`), { force: true });
      writeFileSync(join(OUT, `${i.key}.${best.type}`), best.body);
      manifest[i.key] = `/institutions/${i.key}.${best.type}`;
      console.log(
        `✓ ${i.key.padEnd(22)} ${best.type.padEnd(4)} ${String(best.px).padStart(4)}px  ${new URL(best.url).host}`,
      );
    }
    if (!saved) failed.push(i.key);
  }
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n${Object.keys(sorted).length} logos in manifest.`);
  if (failed.length)
    console.log(`No usable icon (monogram kept): ${failed.join(", ")}`);
}
main().catch((error) => {
  console.error(
    "Logo fetch failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
