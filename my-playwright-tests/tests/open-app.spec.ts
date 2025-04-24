import { test, expect } from '@playwright/test';
import fs from 'fs';

// Add type declaration for firebase in the browser context
declare global {
  interface Window {
    firebase: any;
  }
}

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-auth.json', 'utf-8'));

test('create circle project with image', async ({ page }) => {
  const { email, password, apiKey, authDomain, projectId } = firebaseConfig;

  // Longer timeout for the entire test
  test.setTimeout(120000);  // Increased timeout for the longer test

  await page.goto('https://nearohen.github.io/string-art-git-page/');

  // Inject Firebase SDK
  await page.addScriptTag({ url: 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js' });
  await page.addScriptTag({ url: 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js' });

  // Firebase login
  await page.evaluate(async ({ email, password, apiKey, authDomain, projectId }) => {
    const config = { apiKey, authDomain, projectId };
    // @ts-ignore - firebase is available in the browser context
    if (!firebase.apps.length) firebase.initializeApp(config);
    // @ts-ignore - firebase is available in the browser context
    await firebase.auth().signInWithEmailAndPassword(email, password);
  }, { email, password, apiKey, authDomain, projectId });

  // Wait for login to complete - check for visible "New" button
  await expect(page.locator('#newSession')).toBeVisible({timeout: 15000});
  await page.screenshot({ path: 'screenshots/1-after-login.png' });

  // Click "New" - use ID selector instead of text
  await page.click('#newSession');
  await page.waitForTimeout(1000); // Wait a bit after clicking
  await page.screenshot({ path: 'screenshots/2-after-new-button.png' });

  // Upload woman.png
  await page.click('#triggerFileInput');
  await page.setInputFiles('#loadImgFile', 'tests/test-files/woman.png');
  await page.waitForTimeout(1000); // Wait for upload to process
  await page.screenshot({ path: 'screenshots/3-after-upload.png' });

  // Select "Circle" - using the circle button selector based on screenshot
  // Based on the UI shown, this is likely a radio button or styled button
  await page.click('#circleButton');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/4-after-circle-selection.png' });

  // Fill in circle size - look for the input near the circle button
  const input = await page.locator('#pointsC');
  await input.fill('256');
  await page.waitForTimeout(500);

  // Click "Create Project"
  await page.click('#startSession');
  await page.waitForTimeout(2000); // Wait longer for project creation
  await page.screenshot({ path: 'screenshots/5-after-project-creation.png' });

  // Wait for the Play button to appear
  await page.waitForSelector('#playStop', { timeout: 10000 });
  
  // Click the Play button
  await page.click('#playStop');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/6-after-play-button.png' });
  
  // Verify the play button has changed to stop (icon changes from play_arrow to stop)
  await expect(page.locator('#playStop .material-icons')).toHaveText('stop');
  
  // Wait for 10 seconds to let the simulation run
  console.log('Waiting 10 seconds for the simulation to run...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'screenshots/7-after-waiting.png' });
  
  // Click Stop (which is the same button as Play, but now shows as stop)
  await page.click('#playStop');
  await page.waitForTimeout(1000);
  
  // Verify the button has changed back to play_arrow
  await expect(page.locator('#playStop .material-icons')).toHaveText('play_arrow');
  await page.screenshot({ path: 'screenshots/8-after-stop.png' });
  
  // Find and click the "Make it REAL" button
  await page.click('#makeItButton');
  await page.waitForTimeout(2000); // Wait for link generation
  await page.screenshot({ path: 'screenshots/9-after-make-it-real.png' });
  
  // Verify that a link appears in the instructionAppLink div
  const instructionLink = await page.locator('#instructionAppLink a');
  await expect(instructionLink).toBeVisible({ timeout: 10000 });
  
  // Get and log the generated link URL
  const linkHref = await instructionLink.getAttribute('href');
  console.log('Generated instruction link:', linkHref);
  
  await page.screenshot({ path: 'screenshots/10-final-with-link.png' });
});
