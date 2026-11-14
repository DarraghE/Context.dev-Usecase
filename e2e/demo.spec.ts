import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The §12 demo script, end to end through the UI, in replay mode:
 * consent → upload both zips → processing finishes → review queue (hide one) →
 * chef timeline (proposal first) → first-date card (Context.dev menu match + source link) →
 * generate the menu (dessert cites the proposal memory, vegan variant, no nuts).
 */
async function asPerson(browser: Browser, invitePath: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(invitePath);
  await page.waitForURL((u) => !u.pathname.startsWith("/invite/"));
  return page;
}

async function consentAndUpload(page: Page, upload: (p: Page) => Promise<void>) {
  await expect(page).toHaveURL(/\/partner\/consent/);
  await expect(page.getByRole("heading", { name: "Before you share anything" })).toBeVisible();
  await page.getByLabel("When did your relationship start? (optional)").fill("2021-09-03");
  await page.getByLabel(/I have read the above/).check();
  await page.getByRole("button", { name: "I consent" }).click();
  await expect(page).toHaveURL(/\/partner\/upload/);
  await upload(page);
  await expect(page.getByText("Processed · file deleted")).toBeVisible({ timeout: 120_000 });
  await page.goto("/partner/processing");
  await expect(page.getByRole("heading", { name: "Your food memories are ready" })).toBeVisible({ timeout: 120_000 });
  await page.goto("/partner/review");
}

const approve = (page: Page, dish: string) => page.getByRole("button", { name: `Approve ${dish}`, exact: true }).click();

test("demo script", async ({ browser }) => {
  const t0 = Date.now();

  // Caterer creates the booking and gets the invite links.
  const caterer = await (await browser.newContext()).newPage();
  await caterer.goto("/");
  await caterer.getByRole("button", { name: "Open the caterer demo" }).click();
  await expect(caterer).toHaveURL(/\/caterer$/);
  await caterer.getByRole("link", { name: "New booking" }).first().click();
  await caterer.getByRole("button", { name: "Create booking and invite links" }).click();
  await expect(caterer.getByText(/Booking created for/)).toBeVisible();
  const link = async (role: string) => new URL((await caterer.getByTestId(`invite-${role}`).getAttribute("href"))!).pathname;
  const [a, b, chef] = [await link("partner_a"), await link("partner_b"), await link("chef")];

  // Partner A: real resumable (tus) upload through the file input.
  const aino = await asPerson(browser, a);
  await consentAndUpload(aino, (p) => p.getByTestId("file-input").setInputFiles(path.resolve("fixtures", "exports", "aino_instagram.zip")));
  const first = aino.getByTestId("review-card").first();
  await expect(first).toHaveAttribute("data-dish", "Eton mess");
  await approve(aino, "Eton mess");
  await approve(aino, "Blueberry pie");
  await aino.getByRole("button", { name: "Hide Champagne", exact: true }).click(); // hide one
  await expect(aino.getByRole("tab", { name: /Hidden \(1\)/ })).toBeVisible();

  // Partner B: the demo sample button (same server path as a real upload).
  const sam = await asPerson(browser, b);
  await consentAndUpload(sam, (p) => p.getByTestId("sample-google").click());
  await expect(sam.getByRole("tab", { name: /Hidden \(1\)/ })).toBeVisible(); // hospital pea soup, hidden by default
  for (const d of ["Salmon soup", "Rye bread", "Pizza marinara", "Pizza margherita", "Pizza a portafoglio"]) await approve(sam, d);
  await expect(sam.getByRole("tab", { name: /Approved \(5\)/ })).toBeVisible();

  // Chef: ranked list, proposal first; nothing unapproved visible.
  const chefPage = await asPerson(browser, chef);
  await expect(chefPage).toHaveURL(/\/chef$/);
  await expect(chefPage.getByText(/Allergies:.*nut allergy/)).toBeVisible();
  const cards = chefPage.getByTestId("chef-card");
  await expect(cards).toHaveCount(7);
  await expect(cards.first()).toHaveAttribute("data-dish", "Eton mess");
  await expect(chefPage.getByText("Pea soup")).toHaveCount(0);
  await expect(chefPage.getByText("Champagne")).toHaveCount(0);
  await chefPage.getByRole("button", { name: "Timeline" }).click();
  await expect(cards.first()).toHaveAttribute("data-dish", /Salmon soup|Rye bread/); // 2021 first

  // First-date card: Context.dev menu match with its source link.
  await chefPage.getByRole("link", { name: "Salmon soup", exact: true }).click();
  await expect(chefPage.getByText("On the menu: “JASPER´S SALMON SOUP”", { exact: false }).first()).toBeVisible();
  await expect(chefPage.getByRole("link", { name: /loylyhelsinki\.fi\/en\/menu\/a-la-carte/ }).first()).toBeVisible();
  await expect(chefPage.getByText(/current menu/).first()).toBeVisible();

  // Menu: dessert cites the proposal memory, has a vegan variant, no nuts.
  await chefPage.goto("/chef/menu");
  await chefPage.getByTestId("generate-menu").click();
  const dessert = chefPage.locator('[data-testid="course"][data-course="dessert"]');
  await expect(dessert).toBeVisible();
  await expect(dessert.getByTestId("memory-chip").filter({ hasText: "Eton mess" })).toBeVisible();
  await expect(dessert.getByText(/vegan:/)).toBeVisible();
  await expect(chefPage.getByText("All courses pass the allergy check")).toBeVisible();
  await expect(chefPage.locator('[data-testid="course"]')).toHaveCount(5);
  const menuText = (await chefPage.locator('[aria-label="Courses"]').innerText()).toLowerCase();
  expect(menuText).not.toMatch(/pistachio|hazelnut|almond|walnut|praline/);

  expect(Date.now() - t0).toBeLessThan(5 * 60_000); // §13: under 5 minutes in replay mode
});
