import { test } from '@playwright/test'
import { navigateAndVerifyLoad, navigateAndWait, expectPageLoaded } from './test-helpers'

test.describe('Navigation', () => {
  test('should navigate to accessibility page', async ({ page }) => {
    await navigateAndVerifyLoad(page, '/accessibilite')
  })

  test('should navigate to terms of service page', async ({ page }) => {
    await navigateAndVerifyLoad(page, '/conditions-utilisation')
  })

  test('should navigate to legal terms page', async ({ page }) => {
    await navigateAndVerifyLoad(page, '/mentions-legales')
  })

  test('should show 404 for invalid routes', async ({ page }) => {
    await navigateAndWait(page, '/invalid-route-that-does-not-exist')
    await expectPageLoaded(page)
  })
})

