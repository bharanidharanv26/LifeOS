import { expect, test, type Page } from '@playwright/test';

const editedEmail =
  'Hi Avery,\n\nDecision first: approve the next milestone.\n- Metrics that matter\n- One clear next step\n\nThanks,\nAlex';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, request }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  const health = await request.get('/api/health');
  expect(await health.json()).toMatchObject({ mockMode: true, mockFallback: false });
  expect(
    (await request.post('/api/demo/reset', { data: { confirm: 'FORGET EVERYTHING' } })).ok(),
  ).toBeTruthy();
  expect((await request.post('/api/demo/seed', { data: {} })).ok()).toBeTruthy();
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'No browser errors or failed network requests').toEqual([]);
});

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'No horizontal page overflow',
  ).toBe(true);
}

for (const width of [1440, 1280, 768]) {
  test(`guided learning loop at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const capture = async (name: string, responsive = false) => {
      await noPageOverflow(page);
      if (width === 1440 || responsive) {
        await page.screenshot({
          path: `docs/screenshots/${name}${width === 1440 ? '' : `-${width}`}.png`,
          animations: 'disabled',
        });
      }
    };
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByText('Local database connected')).toBeVisible();
    for (const [view, heading] of [
      ['Calendar', 'No local blocks yet'],
      ['Drafts', 'No drafts yet'],
      ['Notes', 'No local notes yet'],
    ]) {
      await page.getByRole('button', { name: view!, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
      await noPageOverflow(page);
    }
    await page.getByRole('button', { name: 'Open model activity' }).click();
    await expect(
      page.getByText('No model calls yet. Create a plan to see the activity.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close panel' }).click();
    await page.getByRole('button', { name: 'Sessions', exact: true }).click();
    await capture('01-workspace', true);

    const started = Date.now();
    await page.getByRole('button', { name: 'Start guided demo', exact: true }).click();
    const calendar = page.getByRole('article', { name: /Prepare for your investor call/ });
    await expect(calendar).toBeVisible();
    const planMs = Date.now() - started;
    console.info(`${width}px: visible plan in ${planMs}ms`);
    testInfo.annotations.push({ type: 'plan-latency-ms', description: String(planMs) });
    expect(planMs).toBeLessThan(3000);
    await expect(calendar).toContainText('Policy warning');
    await expect(calendar).toContainText(/9:00|09:00/);
    await expect(calendar.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await capture('02-plan-with-warning', true);

    await calendar.getByRole('button', { name: 'Reject', exact: true }).click();
    await calendar.getByRole('button', { name: 'too early', exact: true }).click();
    await calendar.getByRole('button', { name: 'Reject & remember why' }).click();
    await expect(calendar).toContainText('Your feedback: “too early”');
    await calendar.scrollIntoViewIfNeeded();
    await capture('03-reject');

    const email = page.getByRole('article', { name: /Draft a concise agenda/ });
    await email.getByRole('button', { name: 'Edit', exact: true }).click();
    await email.getByRole('textbox', { name: 'body', exact: true }).fill(editedEmail);
    await email.getByRole('button', { name: 'Save & approve' }).click();
    await expect(email).toContainText('Decision first: approve the next milestone.');
    await expect(email).toHaveAccessibleName(/edited/);
    await page.getByRole('button', { name: 'Learn from this', exact: true }).click();
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Learned 2 new preferences.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Learned from this', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('Session locked. Start a new goal to see what changed.'),
    ).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    const learned = page.getByRole('region', { name: 'What I learned' });
    await expect(learned).toContainText('email style');
    await expect(learned).toContainText('→');
    await learned.scrollIntoViewIfNeeded();
    await capture('04-learned-diff');

    await page.getByRole('button', { name: 'Try the next goal' }).click();
    const board = page.getByRole('article', { name: /Prepare for your board meeting/ });
    await expect(board).toBeVisible();
    await expect(board).toContainText(/12:00/);
    await expect(board).not.toContainText('Policy warning');
    await page.locator('.plan-compare summary').click();
    await expect(page.locator('.compare-column').first()).toContainText(/9:00|09:00/);
    await expect(page.locator('.compare-column').last()).toContainText('12:00');
    await expect(page.locator('.change-summary')).toContainText('no morning blocks');
    await expect(page.locator('.change-summary')).toContainText('email style');
    await page.locator('.plan-compare').scrollIntoViewIfNeeded();
    await capture('05-v1-vs-v2', true);

    await page.getByRole('button', { name: 'Approve all safe steps' }).click();
    await expect(page.getByRole('button', { name: 'Run approved (3)' })).toBeEnabled();
    await page.getByRole('button', { name: 'Run approved (3)' }).click();
    await expect(page.locator('.plan-card .status-executed')).toHaveCount(3);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Board call prep' })).toBeVisible();
    await expect(page.locator('.library-card')).toContainText('12:00');
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('06-calendar', true);
    await page.getByRole('button', { name: 'Drafts', exact: true }).click();
    await page.getByRole('button', { name: 'Read full draft' }).click();
    await expect(page.locator('.library-card')).toContainText(
      'Decision first: approve the next milestone.',
    );
    await capture('10-drafts');
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(page.locator('.library-card')).toContainText('Board preparation');
    await capture('11-notes');
    await page.getByRole('button', { name: 'Audit', exact: true }).click();
    await expect(page.locator('.audit-entry').filter({ hasText: 'step.reject' })).toContainText(
      'too early',
    );
    await expect(
      page.locator('.audit-entry').filter({ hasText: 'step.approve' }).first(),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('07-audit');
    await page.getByRole('button', { name: 'Open model activity' }).click();
    await expect(page.locator('.call-row')).toHaveCount(5);
    await expect(page.locator('.call-row').filter({ hasText: 'mock' })).toHaveCount(5);
    await capture('08-model-activity');
    await page.getByRole('button', { name: 'Close panel' }).click();
    if (width === 1440) {
      await page.getByRole('button', { name: /Theme: system/ }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await capture('09-dark-theme');
    }
  });
}
