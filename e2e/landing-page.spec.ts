import { test, expect } from "@playwright/test";

test("marketing homepage renders the hero and key sections for a guest", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /in one universe/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /start your universe/i }).first()).toBeVisible();

  await expect(page.getByRole("heading", { name: "Eight pillars. One dashboard." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Simple, honest pricing" })).toBeVisible();
});

test("guest hitting a protected dashboard route is redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login and register pages are reachable from the homepage nav", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
