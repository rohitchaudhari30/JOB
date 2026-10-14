"""Save a platform login from YOUR computer so a server without a screen can use it.

Run this on your own machine (it opens a normal browser window):

    pip install playwright && playwright install chromium
    python scripts/export_login_session.py naukri

Log in, then press Enter in the terminal. The file `naukri_session.json` is written.
Upload it with POST /api/v1/connections/naukri/import-session  ({"storage_state": <file contents>}).
Keep the file private: anyone who has it can act as you on that site.
"""
import json
import sys

LOGIN_URLS = {
    "naukri": "https://www.naukri.com/nlogin/login",
    "linkedin": "https://www.linkedin.com/login",
}


def main() -> None:
    platform = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if platform not in LOGIN_URLS:
        sys.exit(f"Usage: python {sys.argv[0]} <{'|'.join(LOGIN_URLS)}>")

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(LOGIN_URLS[platform])
        input("Log in in the browser window, then press Enter here... ")
        state = context.storage_state()
        browser.close()

    out = f"{platform}_session.json"
    with open(out, "w") as handle:
        json.dump({"storage_state": state}, handle)
    print(f"Saved {out}. Upload its contents to /api/v1/connections/{platform}/import-session")


if __name__ == "__main__":
    main()
