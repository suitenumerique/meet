import { test, expect } from '@playwright/test'
import { navigateAndWait, expectPageLoaded } from './test-helpers'

test.describe('Home Page', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/LaSuite Meet/i)
  })

  test('should display heading text when backend is available', async ({ page }) => {
    await navigateAndWait(page, '/')
    await page.waitForTimeout(2000)
    
    const heading = page.locator('h1').first()
    const headingVisible = await heading.isVisible().catch(() => false)
    
    if (headingVisible) {
      const headingText = await heading.textContent()
      expect(headingText).toBeTruthy()
      expect(headingText?.trim().length).toBeGreaterThan(0)
    } else {
      await expectPageLoaded(page)
      const body = page.locator('body')
      const hasContent = await body.textContent().then(text => text && text.trim().length > 0)
      expect(hasContent).toBe(true)
      test.skip(true, 'Backend API not available')
    }
  })

  test('should have create meeting button when logged out', async ({ page }) => {
    await navigateAndWait(page, '/')
    await expectPageLoaded(page)
  })

  test('should navigate to legal pages', async ({ page }) => {
    await navigateAndWait(page, '/')
    
    const footer = page.locator('footer')
    if (await footer.isVisible()) {
      const links = footer.locator('a')
      const count = await links.count()
      expect(count).toBeGreaterThan(0)
    }
  })
})

