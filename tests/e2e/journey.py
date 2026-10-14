"""
End-to-end browser journey for ByProduct Intelligence (demo mode).

Run through tests/e2e/run_e2e.py, which seeds an isolated demo store, builds
and starts the production server, then executes this script. It follows the
14-step demonstration workflow from the product brief plus validation, CSV
import, incomplete-data handling and mobile overflow checks. Any failed
assertion, browser console error, page error or failed request fails the run.
"""

import os
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("BASE_URL", "http://localhost:3100")
ART = Path(__file__).parent / "artifacts"
ART.mkdir(exist_ok=True)

console_errors: list[str] = []
failed_requests: list[str] = []
results: list[tuple[str, bool, str]] = []


def step(name):
    def wrap(fn):
        def run(page: Page):
            try:
                fn(page)
                results.append((name, True, ""))
                print(f"PASS  {name}")
            except Exception as e:  # noqa: BLE001 - report every failure
                results.append((name, False, str(e).splitlines()[0][:300]))
                print(f"FAIL  {name}: {e}")
                page.screenshot(path=str(ART / f"failure-{len(results):02d}.png"), full_page=True)

        return run

    return wrap


def go(page: Page, path: str):
    page.goto(BASE + path)
    page.wait_for_load_state("networkidle")


def shot(page: Page, name: str):
    page.screenshot(path=str(ART / f"{name}.png"), full_page=True)


state: dict = {}


def stat_value(page: Page, label: str) -> int:
    text = page.locator(f"text={label}").locator("xpath=..").inner_text()
    return int(re.search(r"\n(\d+)", text).group(1))


@step("1. Landing page explains the product and opens the demo")
def landing(page: Page):
    go(page, "/")
    expect(page.locator("h1")).to_contain_text("evidence")
    expect(page.get_by_text("Status: Promising candidate — technical review required.")).to_be_visible()
    expect(page.get_by_text("independent concept prototype")).to_be_visible()
    shot(page, "01-landing")
    page.get_by_role("link", name="Open the demo").first.click()
    page.wait_for_url("**/dashboard")


@step("2. Dashboard metrics come from live data")
def dashboard(page: Page):
    go(page, "/dashboard")
    expect(page.get_by_text("Demo mode: synthetic data stored in a local file")).to_be_visible()
    state["awaiting_before"] = stat_value(page, "Promising, awaiting review")
    assert state["awaiting_before"] > 0
    assert stat_value(page, "Material profiles") == 7
    shot(page, "02-dashboard")


@step("3. Registry search and filters change the rows shown")
def registry(page: Page):
    go(page, "/materials")
    page.get_by_label("Search name, code or category").fill("BOF")
    page.get_by_role("button", name="Apply").click()
    expect(page.get_by_text("1 of 7 materials")).to_be_visible()
    assert "q=BOF" in page.url, page.url
    go(page, "/materials?family=fly_ash")
    expect(page.get_by_text("2 of 7 materials")).to_be_visible()
    go(page, "/materials?sort=volume")
    first = page.locator("tbody tr").first.inner_text()
    assert "Dry fly ash" in first, first
    shot(page, "03-registry")


@step("4. Material profile shows units, provenance and missing information")
def profile(page: Page):
    go(page, "/materials")
    page.get_by_role("link", name="Weathered BOF slag, 10–40 mm").click()
    page.wait_for_url("**/materials/mat-bof-slag-weathered")
    expect(page.get_by_text("mg/kg").first).to_be_visible()
    expect(page.get_by_text("Synthetic demo value, simulated lab-reported").first).to_be_visible()
    missing = page.locator("section", has_text="Missing information")
    expect(missing).to_contain_text("Leaching test report")
    expect(missing).to_contain_text("Safety-critical")
    shot(page, "04-material-profile")


@step("5–6. Running the engine produces ranked, filterable candidates")
def run_match(page: Page):
    go(page, "/materials/mat-bof-slag-weathered")
    page.get_by_role("button", name="Run match analysis").click()
    page.wait_for_url(re.compile(r".*/match/runs/[0-9a-f-]+$"))
    state["run_url"] = page.url
    expect(page.get_by_role("link", name="Granular sub-base for road pavements", exact=True)).to_be_visible()
    expect(page.get_by_text("bpi-engine-0.1.0")).to_be_visible()
    ranks = page.locator("ol > li [aria-label^='Rank']").all_inner_texts()
    assert ranks[:2] == ["1", "2"], ranks
    shot(page, "05-run-results")
    page.get_by_label("Feasibility state").select_option("ineligible")
    page.get_by_role("button", name="Apply").click()
    expect(page.get_by_text("Showing 2 of 5")).to_be_visible()
    badges = page.locator("ol > li").all_inner_texts()
    assert badges and all("Ineligible" in b for b in badges), badges
    assert not any("Potentially eligible" in b.split("\n")[2] for b in badges)


@step("7–9. Match details: checks, missing evidence and the Missing-Bridge plan")
def details(page: Page):
    page.goto(state["run_url"] + "/app-granular-subbase")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Status: Promising candidate — technical review required.")).to_be_visible()
    plan = page.locator("#bridge-plan")
    expect(plan).to_contain_text("Leaching test report")
    expect(plan).to_contain_text("No threshold is assumed by this software.")
    expect(plan).to_contain_text("Blocking")
    # Bridge segments link to the rule rows.
    page.get_by_role("link", name=re.compile("Leaching test report is unknown")).click()
    assert page.url.endswith("#check-evidence-subbase-leaching"), page.url
    expect(page.locator("#check-evidence-subbase-leaching")).to_contain_text("Not supplied")
    assert "approved" not in page.locator("main").inner_text().lower().replace("not an approval", "").replace("approved for a use", "")
    shot(page, "07-match-detail")
    # A failed hard constraint stays ineligible even with a processing route.
    page.goto(state["run_url"] + "/app-concrete-aggregate")
    expect(page.get_by_text("Ineligible under current constraints")).to_be_visible()
    expect(page.locator("#bridge-plan")).to_contain_text("remains ineligible")


@step("12. Shortlist and mark under review, with decision history")
def shortlist(page: Page):
    page.goto(state["run_url"] + "/app-granular-subbase")
    page.get_by_role("button", name="Save to shortlist").first.click()
    expect(page.get_by_role("button", name="Mark under review").first).to_be_visible()
    page.get_by_role("button", name="Mark under review").first.click()
    expect(page.get_by_text("Under review").first).to_be_visible()
    page.get_by_label("Add a review note").fill("Leaching test quotation requested from lab.")
    page.get_by_role("button", name="Add note").click()
    expect(page.get_by_text("Leaching test quotation requested from lab.")).to_be_visible()
    go(page, "/shortlist")
    expect(page.get_by_role("link", name="Granular sub-base for road pavements", exact=True)).to_be_visible()
    expect(page.get_by_text("Under review").first).to_be_visible()
    shot(page, "12-shortlist")


@step("Compare two or more candidates side by side")
def compare(page: Page):
    page.goto(state["run_url"])
    boxes = page.get_by_role("checkbox", name="Compare")
    boxes.nth(0).check()
    boxes.nth(1).check()
    page.get_by_role("button", name="Compare selected").click()
    page.wait_for_url("**/compare?**")
    heads = page.locator("thead th").all_inner_texts()
    assert len(heads) == 3, heads
    expect(page.get_by_text("Net indicative benefit")).to_be_visible()
    shot(page, "11-compare")


@step("10–11. Scenario changes recalculate economics and ranking")
def scenarios(page: Page):
    go(page, "/scenarios?material=mat-gbfs")
    row = page.locator("tr", has_text="Ground granulated slag for blended cement")
    before = row.inner_text()
    assert "−₹3,030" in before, before
    page.get_by_label("Distance km").first.fill("250")
    expect(row).to_contain_text("₹555")
    after = row.inner_text()
    m = re.findall(r"(\d+\.\d)", after)
    assert float(m[-2]) > float(m[0]) + 15, after  # score rises by more than 15 points
    expect(page.get_by_text("What drives the result")).to_be_visible()
    shot(page, "10-scenarios")
    page.get_by_label("Run label").fill("E2E: nearer grinding unit")
    page.get_by_role("button", name="Save as run").click()
    page.wait_for_url(re.compile(r".*/match/runs/[0-9a-f-]+$"))
    expect(page.get_by_text("E2E: nearer grinding unit").first).to_be_visible()


@step("Incomplete data shows 'Insufficient data' rather than a number")
def incomplete(page: Page):
    go(page, "/materials/mat-foundry-sand")
    page.get_by_role("button", name="Run match analysis").click()
    page.wait_for_url(re.compile(r".*/match/runs/[0-9a-f-]+$"))
    card = page.locator("ol > li", has_text="Manufactured soil ingredient")
    expect(card).to_contain_text("Insufficient data")
    expect(card).to_contain_text("Incomplete evidence")


@step("13. Evidence library search and methodology are reachable")
def evidence(page: Page):
    go(page, "/evidence?q=leaching")
    count = page.locator("li[id^='src-']").count()
    assert count >= 1, count
    expect(page.locator("#src-fhwa-steel-slag-base")).to_contain_text("Accessed")
    go(page, "/methodology")
    expect(page.get_by_text("Unknown is never treated as a pass.")).to_be_visible()


@step("14. Dashboard reflects the review state change")
def dashboard_after(page: Page):
    go(page, "/dashboard")
    after = stat_value(page, "Promising, awaiting review")
    assert after == state["awaiting_before"] - 1, (state["awaiting_before"], after)
    expect(page.get_by_text("1 already under review")).to_be_visible()
    expect(page.get_by_text("Ran matching for BPI-DEMO-SLG-001").first).to_be_visible()


@step("Material form validates input and saves a new profile")
def create_material(page: Page):
    go(page, "/materials/new")
    page.get_by_role("button", name="Create material").click()
    expect(page.get_by_text("field(s) need attention before saving")).to_be_visible()
    expect(page.get_by_text("Name must be at least 3 characters")).to_be_visible()
    page.get_by_label("Material name").fill("E2E test slag")
    page.get_by_label("Source process").fill("Ladle furnace, air-cooled")
    page.get_by_label("Site").fill("Test yard")
    page.get_by_label("Region").fill("Test region")
    page.get_by_label("Latitude (°)").fill("22.8")
    page.get_by_label("Longitude (°)").fill("86.2")
    page.get_by_label("Reporting period").fill("FY 2026")
    page.get_by_label("Current handling pathway").fill("Stockpile")
    page.get_by_role("button", name="Add measurement").click()
    page.get_by_label("Value", exact=True).fill("abc")
    page.get_by_role("button", name="Create material").click()
    expect(page.get_by_text("Value must be a number.")).to_be_visible()
    page.get_by_label("Value", exact=True).fill("140")
    expect(page.get_by_text("outside the plausible range")).to_be_visible()
    page.get_by_label("Value", exact=True).fill("40")
    page.get_by_role("button", name="Create material").click()
    page.wait_for_url(re.compile(r".*/materials/mat-[0-9a-f]+\?saved=1$"))
    expect(page.get_by_text("Material profile saved.")).to_be_visible()
    expect(page.get_by_text("User-supplied data", exact=True)).to_be_visible()


@step("CSV import validates and imports the documented template")
def csv_import(page: Page):
    go(page, "/materials/import")
    with page.expect_download() as dl:
        page.get_by_text("Download the CSV template").click()
    path = Path(tempfile.gettempdir()) / "bpi-template.csv"
    dl.value.save_as(path)
    bad = Path(tempfile.gettempdir()) / "bpi-bad.csv"
    bad.write_text(path.read_text(encoding="utf8").replace(",22.5,", ",222.5,"), encoding="utf8")
    page.set_input_files("input[type=file]", str(bad))
    page.get_by_role("button", name="Validate and import").click()
    expect(page.get_by_text("Nothing was imported.")).to_be_visible()
    page.set_input_files("input[type=file]", str(path))
    page.get_by_role("button", name="Validate and import").click()
    expect(page.get_by_text("Imported 1 material profile(s)")).to_be_visible()


@step("Unknown routes show a helpful not-found page")
def not_found(page: Page):
    # Streamed (partially prerendered) routes cannot change the HTTP status after
    # the shell is sent, so Next.js returns 200 with a noindex directive. Unknown
    # top-level paths return a real 404.
    resp = page.goto(BASE + "/materials/does-not-exist")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("That record does not exist")).to_be_visible()
    assert "noindex" in (page.locator("meta[name=robots]").first.get_attribute("content") or ""), "missing noindex"
    resp = page.goto(BASE + "/does-not-exist")
    assert resp is not None and resp.status == 404, resp and resp.status
    expect(page.get_by_text("That record does not exist")).to_be_visible()


@step("Mobile layouts have no horizontal page overflow")
def mobile(page: Page):
    page.set_viewport_size({"width": 375, "height": 812})
    offenders = []
    for path in ["/", "/dashboard", "/materials", "/materials/mat-bof-slag-weathered", "/applications", state["run_url"].replace(BASE, ""),
                 state["run_url"].replace(BASE, "") + "/app-granular-subbase", "/scenarios?material=mat-gbfs", "/shortlist", "/evidence", "/methodology"]:
        go(page, path)
        sw, iw = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        if sw > iw + 1:
            offenders.append(f"{path} ({sw}>{iw})")
    go(page, state["run_url"].replace(BASE, "") + "/app-granular-subbase")
    shot(page, "mobile-match-detail")
    go(page, "/")
    shot(page, "mobile-landing")
    page.set_viewport_size({"width": 1366, "height": 900})
    assert not offenders, offenders


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 900}, accept_downloads=True)
        page.on("console", lambda m: console_errors.append(f"{page.url}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"{page.url}: pageerror {e}"))
        page.on(
            "response",
            lambda r: failed_requests.append(f"{r.status} {r.url}")
            if r.status >= 400 and "does-not-exist" not in r.url
            else None,
        )
        for fn in [landing, dashboard, registry, profile, run_match, details, shortlist, compare, scenarios, incomplete, evidence,
                   dashboard_after, create_material, csv_import, not_found, mobile]:
            fn(page)
        browser.close()

    # Expected: the deliberate 404 check logs one console error for its own resource.
    console = [c for c in console_errors if "does-not-exist" not in c]
    print("\n--- Summary ---")
    print(f"{sum(ok for _, ok, _ in results)}/{len(results)} steps passed")
    print(f"Console/page errors: {len(console)}")
    for c in console[:20]:
        print("  ", c[:300])
    print(f"Failed requests: {len(failed_requests)}")
    for r in failed_requests[:20]:
        print("  ", r)
    ok = all(ok for _, ok, _ in results) and not console and not failed_requests
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
