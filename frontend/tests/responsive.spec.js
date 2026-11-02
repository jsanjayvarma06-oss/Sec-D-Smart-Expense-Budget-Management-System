
import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'Desktop', width: 1440, height: 900 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 812 }
];

const sampleExpense = {
  id: 'expense-test-1',
  amount: 650,
  spent_on: '2026-11-01',
  merchant: 'Test Supermarket',
  note: 'Weekly groceries',
  category_id: 'category-food',
  category_name: 'Food',
  is_flagged: false
};

async function mockDashboardApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/health') {
      return route.fulfill({
        status: 200,
        json: { status: 'ok' }
      });
    }

    if (path === '/api/auth/me') {
      return route.fulfill({
        status: 200,
        json: {
          user: {
            id: 'test-user',
            name: 'Playwright Test',
            email: 'playwright@example.com',
            role: 'user'
          }
        }
      });
    }

    if (path === '/api/categories') {
      return route.fulfill({
        status: 200,
        json: {
          categories: [
            { id: 'category-food', name: 'Food' },
            { id: 'category-travel', name: 'Travel' }
          ]
        }
      });
    }

    if (path === '/api/expenses') {
      return route.fulfill({
        status: 200,
        json: {
          expenses: [sampleExpense],
          pagination: {
            page: Number(url.searchParams.get('page') || 1),
            limit: 10,
            total: 1,
            totalPages: 1
          }
        }
      });
    }

    if (path === '/api/reports/export') {
      const format = url.searchParams.get('format');

      if (format === 'csv') {
        return route.fulfill({
          status: 200,
          contentType: 'text/csv',
          body: 'Date,Merchant,Amount\n2026-11-01,Test Supermarket,650'
        });
      }

      if (format === 'pdf') {
        return route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: '%PDF-1.4 Playwright test PDF'
        });
      }
    }

    // Empty successful responses for other dashboard APIs.
    return route.fulfill({
      status: 200,
      json: {}
    });
  });
}

// Logs elements extending beyond the mobile viewport.
async function logMobileOverflow(page) {
  const overflowElements = await page.locator('body *').evaluateAll(
    (elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();

          return {
            tag: element.tagName,
            className:
              typeof element.className === 'string'
                ? element.className
                : '',
            text: element.innerText?.slice(0, 60) || '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth
          };
        })
        .filter(
          (element) => element.right > 375 || element.left < 0
        )
  );

  console.log('MOBILE OVERFLOW ELEMENTS:', overflowElements);
}

test.beforeEach(async ({ page }) => {
  await mockDashboardApi(page);
});

// RWD_01, RWD_02 and RWD_03: Desktop, tablet and mobile layouts.
for (const viewport of viewports) {
  test(`${viewport.name}: application loads without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height
    });

    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Expense history' })
    ).toBeVisible();

    if (viewport.name === 'Mobile') {
      await logMobileOverflow(page);
    }

    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );

    expect(pageWidth).toBeLessThanOrEqual(viewport.width);
  });
}

// RWD_04: Search, filters and export controls on mobile.
test('RWD_04: mobile expense search, filters and exports are usable', async ({ page }) => {
  await page.setViewportSize({
    width: 375,
    height: 812
  });

  await page.goto('/');

  const filters = page.locator('.expense-history-filters');

  await expect(
    filters.getByLabel('Search expenses')
  ).toBeVisible();

  await expect(
    filters.getByLabel('Category')
  ).toBeVisible();

  await expect(
    filters.getByLabel('From date')
  ).toBeVisible();

  await expect(
    filters.getByLabel('To date')
  ).toBeVisible();

  await expect(
    filters.getByRole('button', { name: 'Clear filters' })
  ).toBeVisible();

  // Check that the search field accepts input.
  const searchInput = filters.getByLabel('Search expenses');

  await searchInput.fill('Supermarket');
  await expect(searchInput).toHaveValue('Supermarket');

  // Check that the category filter can be changed.
  await filters.getByLabel('Category').selectOption('category-food');

  // Check CSV export download.
  const csvDownloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: /export csv/i }).click();

  const csvDownload = await csvDownloadPromise;

  expect(csvDownload.suggestedFilename()).toContain('.csv');

  // Check PDF export download.
  const pdfDownloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: /export pdf/i }).click();

  const pdfDownload = await pdfDownloadPromise;

  expect(pdfDownload.suggestedFilename()).toContain('.pdf');
});

// RWD_05: Expense table should scroll inside its wrapper on mobile.
test('RWD_05: expense table is contained in its horizontal scroll wrapper on mobile', async ({ page }) => {
  await page.setViewportSize({
    width: 375,
    height: 812
  });

  await page.goto('/');

  const wrapper = page.locator('.expense-table-wrapper');
  const table = page.locator('.expense-table');

  await expect(wrapper).toBeVisible();
  await expect(table).toBeVisible();

  const dimensions = await wrapper.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX
  }));

  expect(['auto', 'scroll']).toContain(dimensions.overflowX);

  expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(
    dimensions.clientWidth
  );

  // Diagnose any elements extending beyond the mobile viewport.
  async function logMobileOverflow(page) {
    const overflowElements = await page.locator('body *').evaluateAll(
      (elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();

            return {
              tag: element.tagName,
              className:
                typeof element.className === 'string'
                  ? element.className
                  : '',
              parentClass:
                typeof element.parentElement?.className === 'string'
                  ? element.parentElement.className
                  : '',
              text: element.innerText?.slice(0, 60) || '',
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth
            };
          })
          .filter(
            (element) => element.right > 375 || element.left < 0
          )
    );

    console.log('MOBILE OVERFLOW ELEMENTS:', overflowElements);
  }

  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  );

  expect(pageWidth).toBeLessThanOrEqual(375);
});
