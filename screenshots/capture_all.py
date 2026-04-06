from playwright.sync_api import sync_playwright
import json, time

URL = "https://book-nova.com/?lang=fr"
OUTPUT_DIR = "/home/florent/Documents/DEV/book-nova/screenshots"

VIEWPORTS = [
    {"name": "desktop",  "width": 1920, "height": 1080},
    {"name": "laptop",   "width": 1366, "height": 768},
    {"name": "tablet",   "width": 768,  "height": 1024},
    {"name": "mobile",   "width": 375,  "height": 812},
]

def get_page_metrics(page):
    return page.evaluate("""() => {
        const h1 = document.querySelector('h1');
        const cta = document.querySelector('a[href*="store"], a[href*="play"], a[href*="download"], .cta, .btn-primary, [class*="cta"], [class*="download"]');
        const hero = document.querySelector('.hero, #hero, [class*="hero"], header');
        const nav = document.querySelector('nav, .navbar, header nav');
        const viewport = { w: window.innerWidth, h: window.innerHeight };
        const metaViewport = document.querySelector('meta[name="viewport"]');
        const h1Rect = h1 ? h1.getBoundingClientRect() : null;
        const ctaRect = cta ? cta.getBoundingClientRect() : null;
        const heroRect = hero ? hero.getBoundingClientRect() : null;
        const fonts = document.fonts ? [...document.fonts].map(f => ({family: f.family, status: f.status})) : [];
        const images = [...document.querySelectorAll('img')].map(img => ({
            src: img.src,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            displayW: img.offsetWidth,
            displayH: img.offsetHeight,
            loading: img.loading,
            alt: img.alt,
            complete: img.complete
        }));
        const hasHorizScroll = document.documentElement.scrollWidth > window.innerWidth;
        return {
            viewport,
            metaViewport: metaViewport ? metaViewport.content : null,
            title: document.title,
            h1Text: h1 ? h1.innerText.trim() : null,
            h1AboveFold: h1Rect ? h1Rect.top < viewport.h && h1Rect.bottom > 0 : false,
            h1Rect,
            ctaText: cta ? cta.innerText.trim() : null,
            ctaHref: cta ? cta.href : null,
            ctaAboveFold: ctaRect ? ctaRect.top < viewport.h && ctaRect.bottom > 0 : false,
            ctaRect,
            heroRect,
            navPresent: !!nav,
            fonts: fonts.slice(0, 10),
            images,
            hasHorizScroll,
            bodyBg: window.getComputedStyle(document.body).backgroundColor,
            scrollHeight: document.body.scrollHeight,
        };
    }""")

def check_dark_theme(page):
    """Toggle dark theme if available and capture screenshot."""
    toggled = page.evaluate("""() => {
        const toggle = document.querySelector('[data-theme], .theme-toggle, #theme-toggle, [aria-label*="theme"], [aria-label*="dark"], [title*="theme"], button[class*="theme"]');
        if (toggle) { toggle.click(); return true; }
        return false;
    }""")
    return toggled

results = {}

with sync_playwright() as p:
    browser = p.chromium.launch()

    for vp in VIEWPORTS:
        print(f"Capturing {vp['name']} ({vp['width']}x{vp['height']})...")
        page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
        page.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)  # let fonts/animations settle

        # Above-the-fold screenshot
        out_atf = f"{OUTPUT_DIR}/{vp['name']}_atf.png"
        page.screenshot(path=out_atf, full_page=False)
        print(f"  Saved ATF: {out_atf}")

        # Full-page screenshot
        out_full = f"{OUTPUT_DIR}/{vp['name']}_full.png"
        page.screenshot(path=out_full, full_page=True)
        print(f"  Saved full: {out_full}")

        metrics = get_page_metrics(page)
        results[vp["name"]] = metrics

        # Dark theme test for desktop only
        if vp["name"] == "desktop":
            toggled = check_dark_theme(page)
            if toggled:
                time.sleep(1)
                page.screenshot(path=f"{OUTPUT_DIR}/desktop_dark_atf.png", full_page=False)
                print("  Saved dark theme ATF")
            else:
                print("  No theme toggle found or could not toggle")

        page.close()

    browser.close()

# Save metrics to JSON
with open(f"{OUTPUT_DIR}/metrics.json", "w") as f:
    json.dump(results, f, indent=2, default=str)

print("\nAll captures complete. Metrics saved to metrics.json")
