import { type Context, Hono } from "hono";

import { getThemeHtml } from "../extensions/themes/registry";
import { getLocale } from "../utils/hono";
import { buildLayoutPage, buildThemedLayoutPage } from "./pages/render";

const TEAPOT_STATUS_TEXT = "I'm a teapot";
const HTML_CONTENT_TYPE = "text/html; charset=UTF-8";
const TEXT_CONTENT_TYPE = "text/plain; charset=UTF-8";
const TEAPOT_ALLOW = "GET, HEAD, POST, BREW, OPTIONS";

const router = new Hono();

const wantsHtml = (c: Context): boolean => {
  const accept = c.req.header("Accept") ?? "";
  return accept.includes("text/html");
};

const buildTeapotPage = async (locale?: string): Promise<string> => {
  const override = await getThemeHtml("teapot");
  if (override) return buildThemedLayoutPage(override, locale);
  return buildLayoutPage("easter-eggs/teapot.html", locale);
};

const teapotHeaders = (contentType: string): HeadersInit => ({
  "Content-Type": contentType,
  Allow: TEAPOT_ALLOW,
});

const teapotResponse = async (c: Context): Promise<Response> => {
  if (c.req.method === "HEAD") {
    return new Response(null, {
      status: 418,
      statusText: TEAPOT_STATUS_TEXT,
      headers: teapotHeaders(
        wantsHtml(c) ? HTML_CONTENT_TYPE : TEXT_CONTENT_TYPE,
      ),
    });
  }

  if (c.req.method === "GET" && wantsHtml(c)) {
    const html = await buildTeapotPage(getLocale(c));
    return new Response(html, {
      status: 418,
      statusText: TEAPOT_STATUS_TEXT,
      headers: teapotHeaders(HTML_CONTENT_TYPE),
    });
  }

  return new Response(TEAPOT_STATUS_TEXT, {
    status: 418,
    statusText: TEAPOT_STATUS_TEXT,
    headers: teapotHeaders(TEXT_CONTENT_TYPE),
  });
};

router.all("/teapot", teapotResponse);
router.all("/teapot/:variety", teapotResponse);

export default router;
