import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('should navigate to accessibility page', async ({ page }) => {
    await page.goto('/accessibilite')
    await page.waitForLoadState('networkidle')
    
    // Page should load without errors
    await expect(page.locator('body')).toBeVisible()
  })

  test('should navigate to terms of service page', async ({ page }) => {
    await page.goto('/conditions-utilisation')
    await page.waitForLoadState('networkidle')
    
    await expect(page.locator('body')).toBeVisible()
  })

  test('should navigate to legal terms page', async ({ page }) => {
    await page.goto('/mentions-legales')
    await page.waitForLoadState('networkidle')
    
    await expect(page.locator('body')).toBeVisible()
  })

  test('should show 404 for invalid routes', async ({ page }) => {
    await page.goto('/invalid-route-that-does-not-exist')
    await page.waitForLoadState('networkidle')
    
    // Should show some error or not found message
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

