"""
Real Web Model — Browser-based visual analysis engine.
Uses Playwright for headless browsing, DOM parsing, and screenshot capture.
Generates annotated screenshots marking suspicious elements.
"""
import os
import io
import re
import logging
import asyncio
import base64
from urllib.parse import urlparse
from typing import Optional

from app.core.ml.base_model import BasePhishModel, ModelOutput
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Known brand patterns for impersonation detection
BRAND_PATTERNS = {
    "paypal": {"colors": ["#003087", "#009cde"], "domains": ["paypal.com"]},
    "amazon": {"colors": ["#ff9900", "#232f3e"], "domains": ["amazon.com", "amazon.co.uk"]},
    "microsoft": {"colors": ["#00a4ef", "#7fba00"], "domains": ["microsoft.com", "live.com", "outlook.com"]},
    "apple": {"colors": ["#000000", "#555555"], "domains": ["apple.com", "icloud.com"]},
    "google": {"colors": ["#4285f4", "#ea4335"], "domains": ["google.com", "gmail.com"]},
    "netflix": {"colors": ["#e50914", "#221f1f"], "domains": ["netflix.com"]},
    "facebook": {"colors": ["#1877f2"], "domains": ["facebook.com", "meta.com"]},
    "instagram": {"colors": ["#e4405f", "#833ab4"], "domains": ["instagram.com"]},
}

# Suspicious DOM patterns
SUSPICIOUS_SELECTORS = [
    {"selector": "input[type='password']", "reason": "Password input field detected", "severity": "high"},
    {"selector": "iframe[style*='display:none'], iframe[style*='visibility:hidden']", "reason": "Hidden iframe detected", "severity": "high"},
    {"selector": "input[type='hidden'][name*='token'], input[type='hidden'][name*='csrf']", "reason": "Hidden token fields", "severity": "medium"},
    {"selector": "form[action*='http']", "reason": "Form submits to external URL", "severity": "high"},
    {"selector": "meta[http-equiv='refresh']", "reason": "Auto-redirect via meta refresh", "severity": "high"},
    {"selector": "script[src*='eval'], script[src*='atob']", "reason": "Potentially obfuscated script", "severity": "medium"},
    {"selector": "div[style*='opacity:0'], div[style*='display:none']", "reason": "Hidden content overlay", "severity": "medium"},
    {"selector": "a[href*='data:'], a[href*='javascript:']", "reason": "Suspicious link protocol", "severity": "high"},
]


class WebVisualModel(BasePhishModel):
    """Production web visual analysis with Playwright screenshots and DOM parsing."""

    def __init__(self):
        super().__init__()
        self._browser = None
        self._playwright = None

    async def load(self) -> None:
        logger.info("✅ WebVisualModel loaded (Playwright will launch on first request)")
        self._loaded = True

    async def _ensure_browser(self):
        """Lazy-init Playwright browser on first use."""
        if self._browser is None:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            logger.info("Playwright Chromium browser launched")

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        url = input_text.strip()
        if not url.startswith("http"):
            url = f"https://{url}"

        try:
            await self._ensure_browser()
            return await self._analyze_page(url)
        except Exception as e:
            logger.error(f"Web analysis failed for {url}: {e}")
            return ModelOutput(
                score=0.3, confidence=0.30,
                verdict="suspicious",
                features={
                    "error": str(e),
                    "url": url,
                    "screenshot_taken": False,
                    "dom_features": {},
                },
                model_version="web-visual-v1",
            )

    async def _analyze_page(self, url: str) -> ModelOutput:
        """Full page analysis: navigate, screenshot, parse DOM, score."""
        timeout = getattr(settings, "playwright_timeout_ms", 15000)
        context = await self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            ignore_https_errors=True,
        )
        page = await context.new_page()

        redirect_chain = []
        page.on("response", lambda resp: redirect_chain.append(resp.url) if resp.status in (301, 302, 303, 307, 308) else None)

        score = 0.0
        suspicious_elements = []
        dom_features = {
            "has_password_field": False,
            "has_hidden_iframe": False,
            "external_js_count": 0,
            "form_action_external": False,
            "meta_refresh": False,
            "hidden_elements_count": 0,
            "obfuscated_js": False,
            "total_forms": 0,
            "total_inputs": 0,
            "total_links": 0,
        }
        brand_signals = {
            "detected_brand": None,
            "title_text": "",
            "favicon_url": "",
            "domain_matches_brand": True,
        }
        ssl_info = {"valid": False, "issuer": "unknown"}
        screenshot_b64 = None

        try:
            # Navigate
            response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            final_url = page.url
            parsed_final = urlparse(final_url)
            domain = parsed_final.hostname or ""

            # SSL check
            if final_url.startswith("https"):
                ssl_info["valid"] = True
                ssl_info["issuer"] = "verified"
            else:
                score += 0.15
                suspicious_elements.append({"selector": "protocol", "reason": "No HTTPS", "severity": "medium"})

            # Wait for page to settle
            await page.wait_for_timeout(1500)

            # Take screenshot
            screenshot_bytes = await page.screenshot(full_page=False, type="png")
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

            # ── DOM Analysis ──
            dom_data = await page.evaluate("""() => {
                const data = {};
                data.title = document.title || '';
                data.passwordFields = document.querySelectorAll("input[type='password']").length;
                data.hiddenIframes = document.querySelectorAll("iframe[style*='display:none'], iframe[style*='visibility:hidden'], iframe[width='0'], iframe[height='0']").length;
                data.totalForms = document.querySelectorAll('form').length;
                data.totalInputs = document.querySelectorAll('input').length;
                data.totalLinks = document.querySelectorAll('a').length;

                // External JS
                const scripts = document.querySelectorAll('script[src]');
                let extJs = 0;
                const currentHost = window.location.hostname;
                scripts.forEach(s => {
                    try {
                        const u = new URL(s.src, window.location);
                        if (u.hostname !== currentHost) extJs++;
                    } catch(e) {}
                });
                data.externalJsCount = extJs;

                // Form actions pointing externally
                const forms = document.querySelectorAll('form[action]');
                let extForm = false;
                forms.forEach(f => {
                    try {
                        const u = new URL(f.action, window.location);
                        if (u.hostname !== currentHost) extForm = true;
                    } catch(e) {}
                });
                data.formActionExternal = extForm;

                // Meta refresh
                const meta = document.querySelector("meta[http-equiv='refresh']");
                data.metaRefresh = !!meta;

                // Hidden elements
                data.hiddenElements = document.querySelectorAll("[style*='display:none'], [style*='visibility:hidden'], [style*='opacity:0']").length;

                // Favicon
                const favicon = document.querySelector("link[rel*='icon']");
                data.faviconUrl = favicon ? favicon.href : '';

                // Inline script content check
                const inlineScripts = document.querySelectorAll('script:not([src])');
                let obfuscated = false;
                inlineScripts.forEach(s => {
                    const c = s.textContent || '';
                    if (c.includes('eval(') || c.includes('atob(') || c.includes('\\\\x') || c.includes('fromCharCode')) {
                        obfuscated = true;
                    }
                });
                data.obfuscatedJs = obfuscated;

                return data;
            }""")

            # Populate DOM features
            dom_features["has_password_field"] = dom_data.get("passwordFields", 0) > 0
            dom_features["has_hidden_iframe"] = dom_data.get("hiddenIframes", 0) > 0
            dom_features["external_js_count"] = dom_data.get("externalJsCount", 0)
            dom_features["form_action_external"] = dom_data.get("formActionExternal", False)
            dom_features["meta_refresh"] = dom_data.get("metaRefresh", False)
            dom_features["hidden_elements_count"] = dom_data.get("hiddenElements", 0)
            dom_features["obfuscated_js"] = dom_data.get("obfuscatedJs", False)
            dom_features["total_forms"] = dom_data.get("totalForms", 0)
            dom_features["total_inputs"] = dom_data.get("totalInputs", 0)
            dom_features["total_links"] = dom_data.get("totalLinks", 0)

            brand_signals["title_text"] = dom_data.get("title", "")[:100]
            brand_signals["favicon_url"] = dom_data.get("faviconUrl", "")[:200]

            # ── Scoring ──
            if dom_features["has_password_field"]:
                score += 0.20
                suspicious_elements.append({"selector": "input[type=password]", "reason": "Password field found", "severity": "high"})

            if dom_features["has_hidden_iframe"]:
                score += 0.25
                suspicious_elements.append({"selector": "iframe[hidden]", "reason": "Hidden iframe detected", "severity": "high"})

            if dom_features["form_action_external"]:
                score += 0.30
                suspicious_elements.append({"selector": "form[action]", "reason": "Form submits to external domain", "severity": "high"})

            if dom_features["meta_refresh"]:
                score += 0.20
                suspicious_elements.append({"selector": "meta[refresh]", "reason": "Auto-redirect detected", "severity": "high"})

            if dom_features["obfuscated_js"]:
                score += 0.20
                suspicious_elements.append({"selector": "script", "reason": "Obfuscated JavaScript detected", "severity": "high"})

            if dom_features["external_js_count"] > 5:
                score += 0.10
                suspicious_elements.append({"selector": "script[src]", "reason": f"{dom_features['external_js_count']} external scripts", "severity": "medium"})

            if dom_features["hidden_elements_count"] > 10:
                score += 0.10
                suspicious_elements.append({"selector": "[hidden]", "reason": f"{dom_features['hidden_elements_count']} hidden elements", "severity": "medium"})

            # Redirect chain scoring
            if len(redirect_chain) > 2:
                score += 0.15
                suspicious_elements.append({"selector": "redirect", "reason": f"{len(redirect_chain)} redirects", "severity": "medium"})

            # Brand impersonation check
            title_lower = brand_signals["title_text"].lower()
            for brand, info in BRAND_PATTERNS.items():
                if brand in title_lower or brand in domain:
                    brand_signals["detected_brand"] = brand
                    official_domains = info["domains"]
                    if not any(d in domain for d in official_domains):
                        brand_signals["domain_matches_brand"] = False
                        score += 0.35
                        suspicious_elements.append({"selector": "title", "reason": f"Brand '{brand}' on non-official domain", "severity": "high"})
                    break

            score = max(0.0, min(1.0, score))

        except Exception as e:
            logger.warning(f"Page analysis error: {e}")
            score = 0.35
            suspicious_elements.append({"selector": "page", "reason": f"Analysis error: {str(e)[:80]}", "severity": "medium"})
        finally:
            await context.close()

        confidence = 0.75 if suspicious_elements else 0.60

        # Upload screenshot to Supabase Storage
        screenshot_url = None
        if screenshot_b64:
            screenshot_url = await self._upload_screenshot(screenshot_b64, url)

        return ModelOutput(
            score=score,
            confidence=confidence,
            verdict=self._score_to_verdict(score),
            features={
                "screenshot_url": screenshot_url,
                "screenshot_base64": screenshot_b64[:100] + "..." if screenshot_b64 else None,
                "screenshot_taken": screenshot_b64 is not None,
                "dom_features": dom_features,
                "brand_signals": brand_signals,
                "suspicious_elements": suspicious_elements,
                "page_load_time_ms": 0,
                "final_url": page.url if 'page' in dir() else url,
                "redirect_chain": redirect_chain[:10],
                "redirect_count": len(redirect_chain),
                "ssl_info": ssl_info,
            },
            model_version="web-visual-v1",
        )

    async def _upload_screenshot(self, b64_data: str, url: str) -> Optional[str]:
        """Upload screenshot to Supabase Storage and return public URL."""
        try:
            from app.db.supabase_client import get_supabase_admin
            import uuid

            supabase = get_supabase_admin()
            bucket = getattr(settings, "screenshot_bucket", "screenshots")
            file_name = f"web_analysis/{uuid.uuid4().hex[:12]}.png"
            file_bytes = base64.b64decode(b64_data)

            # Upload to Supabase Storage
            supabase.storage.from_(bucket).upload(
                file_name, file_bytes,
                file_options={"content-type": "image/png"}
            )

            # Get public URL
            public_url = supabase.storage.from_(bucket).get_public_url(file_name)
            logger.info(f"Screenshot uploaded: {file_name}")
            return public_url
        except Exception as e:
            logger.warning(f"Screenshot upload failed: {e}")
            return None
