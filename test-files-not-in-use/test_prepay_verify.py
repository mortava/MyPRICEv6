"""Verify LP prepay data flows through and UI renders correctly."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # === TEST: DSCR with 36mo prepay ===
    print("=== DSCR with 36mo Prepay ===")
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    console = []
    page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Switch Doc Type to DSCR (uses Radix Select)
    page.get_by_role("combobox", name="Doc Type").click()
    time.sleep(0.5)
    page.get_by_role("option", name="DSCR").click()
    time.sleep(1)

    # Verify Prepay Period is visible and select 36 Months
    prepay = page.get_by_role("combobox", name="Prepay Period")
    print(f"Prepay Period visible: {prepay.is_visible()}")
    prepay.click()
    time.sleep(0.3)
    page.get_by_role("option", name="36 Months").click()
    time.sleep(0.5)

    # Verify Prepay Type and select 5%
    ptype = page.get_by_role("combobox", name="Prepay Type")
    print(f"Prepay Type visible: {ptype.is_visible()}")
    ptype.click()
    time.sleep(0.3)
    page.get_by_role("option", name="5%").click()
    time.sleep(0.5)

    page.screenshot(path="C:/Users/beach/test_form.png")

    # Submit
    page.locator('button[type="submit"]').click()
    print("Submitted")

    # Wait for LP results
    try:
        page.wait_for_selector('text=Expanded Market Rates', timeout=90000)
        print("LP results appeared!")
    except:
        print("LP results timeout")

    time.sleep(3)
    page.screenshot(path="C:/Users/beach/test_results.png", full_page=True)

    # Check LP results
    lp = page.locator('text=Expanded Market Rates')
    if lp.count() > 0:
        lp.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="C:/Users/beach/test_lp_section.png")

        # Check for program name headers (should NOT exist)
        prog_headers = page.locator('.text-indigo-600')
        print(f"Program name headers (should be 0): {prog_headers.count()}")

        # Check tables
        tables = page.locator('table')
        lp_tables = 0
        for t in range(tables.count()):
            headers = tables.nth(t).locator('th')
            h = [headers.nth(i).inner_text() for i in range(headers.count())]
            if 'Price Adj.' in h:
                lp_tables += 1
                rows = tables.nth(t).locator('tbody tr')
                print(f"LP table: {rows.count()} rows")
                for r in range(min(rows.count(), 5)):
                    cells = rows.nth(r).locator('td')
                    ct = [cells.nth(c).inner_text() for c in range(cells.count())]
                    print(f"  {ct}")
        print(f"Total LP tables: {lp_tables}")
    else:
        lp_logs = [l for l in console if 'LP' in l or 'lp' in l.lower()]
        print(f"No LP card. Logs: {lp_logs}")

    page.close()
    browser.close()
    print("\nDone.")
