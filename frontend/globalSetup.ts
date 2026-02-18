import { firefox } from "@playwright/test";

async function globalSetup() {
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "X-Vercel-Protection-Bypass":
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    },
  });
  const page = await context.newPage();

  const baseUrl = process.env.BASE_URL || "http://localhost:5173/";
  console.log(`Navigating to: ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(
      (process.env.E2E_CLERK_USER_USERNAME as string) ||
        "playwrighttest@test.com",
    );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Password" }).click();
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(
      (process.env.E2E_CLERK_USER_PASSWORD as string) || "PlaywrightTest1234",
    );
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL(baseUrl);

  // Save authentication state
  await context.storageState({ path: "tests/auth.json" });
  console.log("Clerk authentication saved!");

  await browser.close();
}

export default globalSetup;
