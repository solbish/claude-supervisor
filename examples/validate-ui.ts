/**
 * validate-ui.ts — Playwright smoke validator for `claude-supervisor`.
 *
 * Optional. Wire in via:
 *
 *     VALIDATE_CMD="npx tsx examples/validate-ui.ts" bash supervisor.sh PLAN.md
 *
 * Loads each route listed in ROUTES, screenshots it, and fails the run on
 * console errors, page errors, or unexpected network failures. Designed as
 * a starting point — copy into your project, edit ROUTES + the noise
 * filters, and point BASE_URL at your dev server.
 *
 * Env vars:
 *   BASE_URL          default http://localhost:3000
 *   HEADED            "1" to run with a visible browser
 *   OUT_DIR           screenshot directory (default ./.supervisor-screens)
 *   APP_DIR           if set, resolve playwright from APP_DIR/node_modules
 *                     (handy when the app lives in a subfolder of the repo)
 *   E2E_LOGIN_EMAIL   if set, POST to E2E_LOGIN_URL with this email before crawling
 *   E2E_LOGIN_TOKEN   bearer token required when E2E_LOGIN_EMAIL is set
 *   E2E_LOGIN_URL     default `${BASE_URL}/api/auth/e2e-login`
 *
 * Exit codes:
 *   0  all routes loaded clean
 *   1  one or more routes had console errors, network failures, or load errors
 *   2  could not reach BASE_URL at all
 *   3  e2e-login failed (only when E2E_LOGIN_* env vars are set)
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

// Resolve `playwright` from APP_DIR/node_modules if APP_DIR is set, otherwise
// from cwd/node_modules. Lets you keep playwright as a dep of the app rather
// than a sibling tooling folder.
const APP_NODE_MODULES = resolve(
  process.env.APP_DIR
    ? join(process.env.APP_DIR, "node_modules")
    : join(process.cwd(), "node_modules"),
);
const requireFromApp = createRequire(
  pathToFileURL(APP_NODE_MODULES + "/").href,
);
const { chromium } = requireFromApp("playwright") as typeof import("playwright");
type BrowserContext = import("playwright").BrowserContext;
type ConsoleMessage = import("playwright").ConsoleMessage;
type Page = import("playwright").Page;

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HEADED = process.env.HEADED === "1";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "./.supervisor-screens");
const E2E_LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL;
const E2E_LOGIN_TOKEN = process.env.E2E_LOGIN_TOKEN;
const E2E_LOGIN_URL =
  process.env.E2E_LOGIN_URL ?? `${BASE_URL}/api/auth/e2e-login`;

type Route = {
  path: string;
  name: string;
  /** Optional CSS selector to wait for before screenshotting */
  waitFor?: string;
  /** When true, only included if E2E_LOGIN_EMAIL is set */
  requiresAuth?: boolean;
};

// Public routes — always tested. Edit for your project.
const PUBLIC_ROUTES: Route[] = [
  { path: "/", name: "home" },
];

// Authenticated routes — only tested when E2E_LOGIN_* env vars are set.
const AUTH_ROUTES: Route[] = [
  // { path: "/dashboard", name: "dashboard", requiresAuth: true },
];

const ROUTES: Route[] = [
  ...PUBLIC_ROUTES,
  ...(E2E_LOGIN_EMAIL ? AUTH_ROUTES : []),
];

type RouteResult = {
  name: string;
  path: string;
  status: number | null;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  ok: boolean;
};

async function checkRoute(page: Page, route: Route): Promise<RouteResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Add project-specific noise filters here. The goal is to drop known-
    // benign errors so real regressions surface.
    if (/Failed to load resource.*status of (401|403|404)/.test(text)) return;
    consoleErrors.push(text);
  };
  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onRequestFailed = (req: import("playwright").Request) => {
    const url = req.url();
    const errText = req.failure()?.errorText ?? "";
    // Drop third-party tile / CDN failures here — they're not your bugs.
    // e.g.: if (/cartocdn|openstreetmap/i.test(url)) return;
    // Drop net::ERR_ABORTED on RSC prefetches and Next.js chunks.
    if (errText === "net::ERR_ABORTED") {
      if (/\?_rsc=/.test(url)) return;
      if (/\/_next\/static\//.test(url)) return;
    }
    failedRequests.push(`${req.method()} ${url} — ${errText}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);

  let status: number | null = null;
  try {
    const resp = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    status = resp?.status() ?? null;
    if (route.waitFor) {
      await page.waitForSelector(route.waitFor, { timeout: 15_000 });
    }
    // Let client components mount and emit any post-hydration errors.
    await page.waitForTimeout(2_000);
    await page.screenshot({
      path: `${OUT_DIR}/${route.name}.png`,
      fullPage: true,
    });
  } catch (err) {
    pageErrors.push((err as Error).message);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
  }

  const ok =
    status !== null &&
    status < 400 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    failedRequests.length === 0;

  return {
    name: route.name,
    path: route.path,
    status,
    consoleErrors,
    pageErrors,
    failedRequests,
    ok,
  };
}

async function signIn(context: BrowserContext): Promise<void> {
  if (!E2E_LOGIN_EMAIL) return;
  if (!E2E_LOGIN_TOKEN) {
    console.error("validate-ui: E2E_LOGIN_EMAIL set but E2E_LOGIN_TOKEN missing");
    process.exit(3);
  }

  console.log(`validate-ui: signing in as ${E2E_LOGIN_EMAIL}`);
  const resp = await context.request.post(E2E_LOGIN_URL, {
    headers: {
      "Content-Type": "application/json",
      "x-e2e-token": E2E_LOGIN_TOKEN,
    },
    data: { email: E2E_LOGIN_EMAIL },
  });

  if (!resp.ok()) {
    const body = await resp.text().catch(() => "");
    console.error(
      `validate-ui: e2e-login failed (${resp.status()}). Body: ${body.slice(0, 200)}`,
    );
    process.exit(3);
  }
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`validate-ui: base=${BASE_URL}  out=${OUT_DIR}`);

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  await signIn(context);

  const page = await context.newPage();

  // Reachability probe before iterating routes.
  try {
    const resp = await page.goto(BASE_URL, { timeout: 15_000 });
    if (!resp || resp.status() >= 500) {
      console.error(
        `validate-ui: ${BASE_URL} unreachable (status ${resp?.status()})`,
      );
      await browser.close();
      process.exit(2);
    }
  } catch (err) {
    console.error(
      `validate-ui: cannot reach ${BASE_URL}: ${(err as Error).message}`,
    );
    await browser.close();
    process.exit(2);
  }

  const results: RouteResult[] = [];
  for (const route of ROUTES) {
    process.stdout.write(`  ${route.path.padEnd(20)} `);
    const result = await checkRoute(page, route);
    results.push(result);
    console.log(
      result.ok
        ? `✅ ${result.status}`
        : `❌ ${result.status ?? "ERR"}  console=${result.consoleErrors.length}  page=${result.pageErrors.length}  net=${result.failedRequests.length}`,
    );
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error("\n── failures ──");
    for (const r of failed) {
      console.error(`\n${r.path}  (status=${r.status})`);
      for (const e of r.consoleErrors) console.error(`  console: ${e}`);
      for (const e of r.pageErrors) console.error(`  page:    ${e}`);
      for (const e of r.failedRequests) console.error(`  net:     ${e}`);
    }
    process.exit(1);
  }

  console.log(`\nvalidate-ui: ✅ ${results.length} routes clean`);
}

main().catch((err) => {
  console.error("validate-ui: fatal", err);
  process.exit(1);
});
