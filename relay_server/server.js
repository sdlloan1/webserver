const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

const app = express();
const PORT = process.env.PORT || 3000;

const UPSTREAM_PROXIES = {
  US: process.env.PROXY_US || "",
  GB: process.env.PROXY_GB || "",
  DE: process.env.PROXY_DE || "",
  JP: process.env.PROXY_JP || "",
  IN: process.env.PROXY_IN || "",
  SG: process.env.PROXY_SG || "",
  BR: process.env.PROXY_BR || ""
};

function getAgent(countryCode) {
  const proxyUrl = UPSTREAM_PROXIES[countryCode];
  if (!proxyUrl) return undefined;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

function buildToolbar(targetUrl, country) {
  return `
    <div id="resiroute-bar" style="position:fixed;top:0;left:0;right:0;height:42px;background:#0f172a;color:#fff;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:sans-serif;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.3);">
      <div style="display:flex;align-items:center;gap:10px;">
        <strong style="color:#38bdf8;">ResiRoute Gateway</strong>
        <span style="background:#1e293b;padding:2px 8px;border-radius:4px;">Exit: ${country}</span>
      </div>
      <form action="/proxy" method="GET" style="display:flex;gap:6px;flex:1;max-width:500px;margin:0 16px;">
        <input type="text" name="url" value="${targetUrl}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid #334155;background:#1e293b;color:#fff;" />
        <input type="hidden" name="country" value="${country}" />
        <button type="submit" style="background:#3b82f6;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;">Go</button>
      </form>
      <button onclick="document.getElementById('resiroute-bar').remove()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;">✕</button>
    </div>
    <div style="height:42px;"></div>
  `;
}

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  const country = (req.query.country || "US").toUpperCase();

  if (!targetUrl) {
    return res.status(400).send("Missing ?url= parameter");
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const agent = getAgent(country);

    const response = await axios.get(parsedUrl.href, {
      httpsAgent: agent,
      httpAgent: agent,
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      },
      validateStatus: () => true
    });

    const contentType = response.headers["content-type"] || "text/html";
    res.set("Content-Type", contentType);

    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      const rewriteAttr = (selector, attr) => {
        $(selector).each((_, el) => {
          const val = $(el).attr(attr);
          if (val && !val.startsWith("data:") && !val.startsWith("javascript:") && !val.startsWith("#")) {
            try {
              const absolute = new URL(val, parsedUrl.origin).href;
              $(el).attr(attr, `/proxy?url=${encodeURIComponent(absolute)}&country=${country}`);
            } catch (_) {}
          }
        });
      };

      rewriteAttr("a", "href");
      rewriteAttr("link", "href");
      rewriteAttr("script", "src");
      rewriteAttr("img", "src");
      rewriteAttr("form", "action");

      $("body").prepend(buildToolbar(parsedUrl.href, country));
      return res.send($.html());
    }

    return res.send(response.data);
  } catch (err) {
    res.status(502).send(`Gateway Error fetching ${targetUrl}: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`ResiRoute Web Proxy Gateway running on http://localhost:${PORT}`);
});
