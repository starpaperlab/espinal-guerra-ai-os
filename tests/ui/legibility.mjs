// Component-only presentation fixture. Stubs never run in the application or bypass its routes.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, readdir, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
// Normalize Next's CJS image export for esbuild; retain the real Image implementation.
const imageInterop = {
  name: "next-image-interop",
  setup(build) {
    build.onResolve({ filter: /^next\/image$/ }, () => ({
      path: "next-image",
      namespace: "image-interop",
    }));
    build.onLoad({ filter: /.*/, namespace: "image-interop" }, () => ({
      resolveDir: process.cwd(),
      contents:
        'export { Image as default } from "next/dist/client/image-component.js";',
    }));
  },
};
const temporary = await mkdtemp(join(tmpdir(), "eg-legibility-"));
const output = resolve("test-results/legibility");
await mkdir(output, { recursive: true });
let browser;
try {
  await build({
    stdin: {
      contents: `import { renderToStaticMarkup } from 'react-dom/server';
      export { corporateTheme as theme } from './src/config/corporate-identity';
      import { Workspace } from './src/components/workspace';
      import { modules } from './src/modules/catalog';
      import Login from './src/app/login/page';
      import Pending from './src/app/configuracion-pendiente/page';
      import {CrmView,CrmBrandFilter} from './src/modules/crm/view';
      import {crmFixture,crmDetailFixture} from './tests/crm/fixtures';
      export const screens = Object.fromEntries(modules.map(module => [module.slug, renderToStaticMarkup(<Workspace module={module}/>)]));
      screens.login = renderToStaticMarkup(await Login({searchParams: Promise.resolve({error: 'credentials'})}));
      screens.pending = renderToStaticMarkup(<Pending/>);
      for(const [name,data] of Object.entries({'crm-vacio':crmFixture,'crm-bandeja':{...crmDetailFixture,detail:null},'crm-ficha':crmDetailFixture,'crm-pipeline':{...crmDetailFixture,query:{vista:'pipeline'}},'crm-seguimiento':{...crmDetailFixture,query:{vista:'seguimiento'}},'crm-pendiente':{...crmFixture,summary:null,error:'Migración pendiente de aplicar'}})) {
        screens[name]=renderToStaticMarkup(<Workspace module={modules.find(m=>m.slug==='ventas')} headerControl={<CrmBrandFilter data={data}/>}><CrmView data={data}/></Workspace>);
      }
`,
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
      imageInterop,
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
                    : `export async function signIn() {} export async function signOut() {} export async function createLead() {} export async function updateLead() {} export async function createOpportunity() {} export async function moveOpportunity() {} export async function createActivity() {} export async function completeActivity() {} export async function createProposal() {}`,
          }));
        },
      },
    ],
  });
  const { screens, theme } = await import(
    pathToFileURL(join(temporary, "fixture.mjs"))
  );
  const themeStyle = Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(";")
    .replaceAll('"', "&quot;");
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
        `<!doctype html><html lang="es" style="${themeStyle}"><head><base href="https://fixture.local/_next/static/chunks/"><style>${css}</style></head><body>${html}</body></html>`,
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
      if (name.startsWith("crm-"))
        await page.locator(".crm details").evaluateAll((nodes) =>
          nodes.forEach((node) => {
            node.open = true;
          }),
        );
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
      if (["dashboard", "marcas"].includes(name)) {
        assert.equal(
          await page.locator(".brands-grid").count(),
          1,
          "A single portfolio grid per page",
        );
        assert.equal(
          await page.locator(".brand-card").count(),
          4,
          "All four brands remain visible",
        );
        assert.equal(await page.locator("#portfolio-heading").count(), 1);
        assert.equal(
          await page
            .locator(".sidebar .corporate-identity")
            .getAttribute("data-variant"),
          "dark",
        );
      }
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
        ["dashboard", "login", "crm-ficha", "crm-pipeline"].includes(name) &&
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
  // Hydrate the real next/image component to exercise load/error and source replacement.
  const interactive = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client'; import {BrandLogo} from './src/components/brand-logo'; import {CorporateIdentity} from './src/components/corporate-identity';
      const root = createRoot(document.getElementById('logo-test'));
      window.renderBrand = logo => root.render(<BrandLogo name="Marca de prueba" initials="MP" logo={logo}/>);
      window.renderIdentity = variant => root.render(<CorporateIdentity variant={variant}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    write: false,
    plugins: [imageInterop],
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  });
  await page.route("https://fixture.local/brands/test-logo.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#1E3A6D"/></svg>',
    }),
  );
  await page.setContent(
    `<!doctype html><html style="${themeStyle}"><head><base href="https://fixture.local/"><style>${css}</style></head><body><div id="logo-test"></div></body></html>`,
  );
  await page.addScriptTag({ content: interactive.outputFiles[0].text });
  await page.evaluate(() => window.renderBrand(null));
  await page.locator(".brand-logo-placeholder").waitFor();
  assert.equal(await page.locator(".brand-logo img").count(), 0);
  await page.evaluate(() => window.renderBrand("/brands/missing-test.svg"));
  await page.waitForFunction(
    () =>
      document.querySelector(".brand-logo")?.dataset.logoState ===
        "placeholder" && !document.querySelector(".brand-logo img"),
  );
  assert.equal(
    await page.locator(".brand-logo-placeholder").textContent(),
    "MP",
  );
  await page.evaluate(() => window.renderBrand("/brands/test-logo.svg"));
  await page.waitForFunction(
    () => document.querySelector(".brand-logo")?.dataset.logoState === "loaded",
  );
  assert.equal(
    await page.locator(".brand-logo img").getAttribute("alt"),
    "Logo de Marca de prueba",
  );
  assert.equal(
    await page
      .locator(".brand-logo img")
      .evaluate((el) => getComputedStyle(el).objectFit),
    "contain",
  );
  assert.equal(
    await page.locator(".brand-logo-placeholder").getAttribute("aria-hidden"),
    "true",
  );
  await page.evaluate(() => window.renderBrand(null));
  await page.waitForFunction(
    () =>
      document.querySelector(".brand-logo")?.dataset.logoState ===
      "placeholder",
  );
  console.log(
    "Logo checks passed: absent source, failed image, successful load, aspect ratio and source replacement.",
  );
  await page.evaluate(() => window.renderIdentity("dark"));
  await page.waitForFunction(
    () =>
      document.querySelector('.corporate-identity[data-variant="dark"]') &&
      !document.querySelector(".corporate-identity img"),
  );
  assert.match(
    await page.locator(".identity-fallback").textContent(),
    /ESPINAL GUERRA/,
  );
  await page.route("https://fixture.local/_next/image?**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="#FFFFFF"/></svg>',
    }),
  );
  for (const [variant, expected] of [
    ["light", "/brand/espinal-guerra-logo.png"],
    ["dark", "/brand/espinal-guerra-logo-white.png"],
  ]) {
    await page.evaluate((variant) => window.renderIdentity(variant), variant);
    await page.waitForFunction(
      () =>
        document.querySelector(".corporate-identity")?.dataset.logoState ===
        "loaded",
    );
    assert.ok(
      (await page.locator(".corporate-logo").getAttribute("src")).includes(
        encodeURIComponent(expected),
      ),
      `Correct original asset for ${variant}`,
    );
    assert.equal(
      await page
        .locator(".corporate-logo")
        .evaluate((el) => getComputedStyle(el).objectFit),
      "contain",
    );
    assert.equal(
      await page
        .locator(".corporate-logo")
        .evaluate((el) => getComputedStyle(el).filter),
      "none",
    );
    assert.equal(
      await page.locator(".identity-fallback").getAttribute("aria-hidden"),
      "true",
    );
  }
  console.log(
    "Corporate identity checks passed: missing artwork, light/dark asset selection, original proportions and no recoloring.",
  );
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
