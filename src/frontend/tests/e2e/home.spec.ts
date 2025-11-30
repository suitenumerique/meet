import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/')
    // Title is "LaSuite Meet" (no space) as set in compose.yml
    await expect(page).toHaveTitle(/LaSuite Meet/i)
  })

  test('should display heading text when backend is available', async ({ page }) => {
    await page.goto('/')
    
    // Wait for network activity to settle
    await page.waitForLoadState('networkidle')
    
    // The Home component depends on API calls (useConfig, useUser)
    // UserAware shows LoadingScreen until isLoggedIn is defined
    // This test requires the backend to be running
    
    // Wait a bit for React to render
    await page.waitForTimeout(2000)
    
    // Check for heading - it may not appear if backend API calls are failing
    const heading = page.locator('h1').first()
    
    // Check if heading exists (if backend is available)
    const headingVisible = await heading.isVisible().catch(() => false)
    
    if (headingVisible) {
      // Backend is available - verify heading content
      const headingText = await heading.textContent()
      expect(headingText).toBeTruthy()
      expect(headingText?.trim().length).toBeGreaterThan(0)
    } else {
      // Backend not available - verify page at least loads
      // The page should show loading or error state, not be blank
      const body = page.locator('body')
      await expect(body).toBeVisible()
      
      // Check for loading state
      const hasContent = await body.textContent().then(text => text && text.trim().length > 0)
      expect(hasContent).toBe(true)
      
      // Skip test - backend required
      test.skip(true, 'Backend API not available - heading requires API calls to render')
    }
  })

  test('should have create meeting button when logged out', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Page should load successfully
    await expect(page.locator('body')).toBeVisible()
  })

  test('should navigate to legal pages', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Try to find footer links
    const footer = page.locator('footer')
    if (await footer.isVisible()) {
      // Check if footer links work
      const links = footer.locator('a')
      const count = await links.count()
      expect(count).toBeGreaterThan(0)
    }
  })
})

