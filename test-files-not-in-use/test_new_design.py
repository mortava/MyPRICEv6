"""Capture screenshot of new AI Reviewed LP design."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    lp_done = []
    def on_resp(resp):
        if 'get-lp-pricing' in resp.url:
            lp_done.append(time.time())
    page.on("response", on_resp)

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Switch to DSCR
    page.get_by_role("combobox", name="Doc Type").click()
    time.sleep(0.5)
    page.get_by_role("option", name="DSCR").click()
    time.sleep(1)

    # Set 36 month prepay
    page.get_by_role("combobox", name="Prepay Period").click()
    time.sleep(0.3)
    page.get_by_role("option", name="36 Months").click()
    time.sleep(0.5)

    # Submit
    t0 = time.time()
    page.locator('button[type="submit"]').click()
    print("Submitted")

    # Wait for LP response
    while time.time() - t0 < 90:
        if lp_done:
            print(f"LP response at t={lp_done[0]-t0:.0f}s")
            break
        time.sleep(2)
    else:
        print("LP timeout - taking screenshot anyway")

    time.sleep(4)

    # Scroll to LP section
    ai = page.locator('text=AI Reviewed')
    scanning = page.locator('text=Scanning national')
    if ai.count() > 0:
        ai.first.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="C:/Users/beach/test_ai_design.png")
        print("AI Reviewed section found - screenshot saved")
    elif scanning.count() > 0:
        scanning.first.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="C:/Users/beach/test_ai_design.png")
        print("Loading state found - screenshot saved")
    else:
        page.screenshot(path="C:/Users/beach/test_ai_design.png", full_page=True)
        print("Full page screenshot saved")

    page.close()
    browser.close()
    print("Done.")
