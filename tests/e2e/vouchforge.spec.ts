import { expect, test } from "@playwright/test";

test.describe("VouchForge AI", () => {
  test("moves a reviewed asset through human approval and publishing", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main", { name: "VouchForge AI command center" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Campaign: Q2 Customer Advocacy/ })).toBeVisible();

    await page.getByRole("button", { name: "Approve & Publish" }).click();

    await expect(page.getByText("Human approval recorded. Free website channels are live and external channels are queued.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & Publish" })).toBeVisible();
  });

  test("collects consented customer proof", async ({ page }) => {
    await page.goto("/collect/q2-customer-advocacy");

    await page.getByLabel("Name").fill("Asha Mehta");
    await page.getByLabel("Email").fill("asha@example.com");
    await page.getByLabel("Company").fill("Northstar Labs");
    await page
      .getByLabel("What changed after working with Acme Co.?")
      .fill("The process became much clearer and our team could act on customer proof faster.");
    await page.getByLabel("I allow this feedback to be reviewed and published as customer proof after approval.").check();
    await page.getByLabel("I allow AI processing to summarize and format my real feedback.").check();

    await page.getByRole("button", { name: "Submit Feedback" }).click();

    await expect(page.getByRole("heading", { name: "Thank you for sharing your story." })).toBeVisible();
    await expect(page.getByText(/will approve anything public before it is published/i)).toBeVisible();
  });

  test("keeps draft testimonials off the public page", async ({ page }) => {
    await page.goto("/testimonials/acme-demo");

    await expect(page.getByRole("heading", { name: "Real customer proof for Acme Co." })).toBeVisible();
    await expect(page.getByText("Daniel Kim")).toBeVisible();
    await expect(page.getByText("VouchForge helped us increase outbound conversions by 48% in just two quarters.")).toHaveCount(0);
  });
});
