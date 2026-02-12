import { Page, expect } from '@playwright/test'

export async function navigateAndWait(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

export async function expectPageLoaded(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible()
}

export async function navigateAndVerifyLoad(
  page: Page,
  path: string
): Promise<void> {
  await navigateAndWait(page, path)
  await expectPageLoaded(page)
}

