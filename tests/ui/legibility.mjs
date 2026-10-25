// Component-only presentation fixture. Stubs never run in the application or bypass its routes.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, readdir, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "eg-legibility-"));
const output = resolve("test-results/legibility");
await mkdir(output, { recursive: true });
let browser;
try {
  await build({
    stdin: {
      contents: `import { renderToStaticMarkup } from 'react-dom/server';
      import { Workspace } from './src/components/workspace';
      import { modules } from './src/modules/catalog';
      import Login from './src/app/login/page';
      import Pending from './src/app/configuracion-pendiente/page';
      export const screens = Object.fromEntries(modules.map(module => [module.slug, renderToStaticMarkup(<Workspace module={module}/>)]));
      screens.login = renderToStaticMarkup(await Login({searchParams: Promise.resolve({error: 'credentials'})}));
      screens.pending = renderToStaticMarkup(<Pending/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: join(temporary, "fixture.mjs"),
    plugins: [
      {
        name: "presentation-only",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(next\/link|next\/navigation|@\/app\/login\/actions|\.\/actions|@\/lib\/supabase\/config)$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            resolveDir: process.cwd(),
            loader: "jsx",
            contents:
              path === "next/link"
                ? `import React from 'react'; export default function Link({href,children,...props}) { return <a href={href} {...props}>{children}</a>; }`
                : path === "next/navigation"
                  ? `export const useRouter = () => ({ push() {} }); export const usePathname = () => '/dashboard'; export function redirect() { throw new Error('Unexpected redirect in isolated presentation fixture'); }`
                  : path.includes("config")
                    ? `export const getSupabaseConfig = () => true;`
                    : `export async function signIn() {} export async function signOut() {}`,
          }));
        },
      },
    ],
  });
  const { screens } = await import(
    pathToFileURL(join(temporary, "fixture.mjs"))
  );
  const cssDir = ".next/static/chunks";
  const css = (
    await Promise.all(
      (await readdir(cssDir))
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(join(cssDir, f), "utf8")),
    )
  ).join("\n");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage();
  await page.route("https://fixture.local/**", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop();
    if (!/^[a-zA-Z0-9._-]+\.woff2?$/.test(filename || "")) return route.abort();
    await route.fulfill({
      body: await readFile(join(".next/static/media", filename)),
      contentType: filename.endsWith("woff2") ? "font/woff2" : "font/woff",
    });
  });
  let checks = 0;
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, html] of Object.entries(screens)) {
      await page.setContent(
        `<!doctype html><html lang="es"><head><base href="https://fixture.local/_next/static/chunks/"><style>${css}</style></head><body>${html}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () =>
            document.fonts.check("16px Poppins") &&
            document.fonts.check("600 32px Montserrat"),
        ),
        "Corporate fonts must load",
      );
      if (width <= 1024 && name !== "login" && name !== "pending")
        await page.locator(".mobile-nav").evaluate((el) => {
          el.open = true;
        });
      const problems = await page.evaluate(() => {
        const problems = [];
        const visible = (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== "hidden";
        if (document.documentElement.scrollWidth > innerWidth + 1)
          problems.push(
            `horizontal overflow: ${document.documentElement.scrollWidth}/${innerWidth}`,
          );
        for (const el of document.querySelectorAll("body *")) {
          if (!visible(el) || el.closest('svg, [aria-hidden="true"]')) continue;
          const text = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
          );
          if (text && parseFloat(getComputedStyle(el).fontSize) < 14)
            problems.push(`small text: ${el.className}`);
          if (
            text &&
            el.scrollWidth > el.clientWidth + 2 &&
            getComputedStyle(el).display !== "inline"
          )
            problems.push(`clipped text: ${el.className}`);
        }
        for (const el of document.querySelectorAll(
          ".nav-link, button, input, select, summary",
        )) {
          if (visible(el) && el.getBoundingClientRect().height < 44)
            problems.push(`small target: ${el.className || el.tagName}`);
        }
        if (parseFloat(getComputedStyle(document.body).fontSize) !== 16)
          problems.push("base is not 16px");
        return problems;
      });
      assert.deepEqual(problems, [], `${name} at ${width}px`);
      if (name === "dashboard") {
        assert.equal(
          await page
            .locator(".nav-link")
            .first()
            .evaluate((el) => getComputedStyle(el).fontSize),
          "16px",
        );
        assert.equal(
          await page
            .locator(".brand-card h3")
            .first()
            .evaluate((el) => getComputedStyle(el).fontSize),
          "20px",
        );
      }
      if (
        ["dashboard", "login"].includes(name) &&
        [390, 768, 1440].includes(width)
      )
        await page.screenshot({
          path: join(output, `${name}-${width}.png`),
          fullPage: true,
        });
      if (name === "dashboard" && width === 1440) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement.className),
          "skip-link",
        );
        assert.notEqual(
          await page
            .locator(".skip-link")
            .evaluate((el) => getComputedStyle(el).outlineStyle),
          "none",
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute("aria-current"),
          ),
          "page",
        );
      }
      checks++;
    }
  }
  // WCAG AA normal-text threshold for the actual palette, including tinted surfaces.
  const luminance = (hex) => {
    const rgb = hex
      .replace("#", "")
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const pairs = [
    ["#2b2f33", "#ffffff"],
    ["#1e3a6d", "#f7f9fc"],
    ["#1e3a6d", "#e6ecf4"],
    ["#0a1f44", "#ffffff"],
    ["#ffffff", "#0a1f44"],
    ["#ffffff", "#1e3a6d"],
    ["#e6ecf4", "#0a1f44"],
    ["#e6ecf4", "#1e3a6d"],
    ["#9b3044", "#ffffff"],
  ];
  for (const [fg, bg] of pairs) {
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    assert.ok(
      (values[0] + 0.05) / (values[1] + 0.05) >= 4.5,
      `${fg} on ${bg} must meet AA`,
    );
  }
  console.log(
    `${checks} presentation checks passed; ${pairs.length} AA contrast pairs passed. Screenshots: ${output}`,
  );
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
