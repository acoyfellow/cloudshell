import { chromium } from 'playwright';
import path from 'path';

async function recordDemo() {
  const videoDir = '/Users/jordan/Desktop/cloudshell-demo';
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1200, height: 800 }
    }
  });
  
  const page = await context.newPage();
  
  // Navigate to CloudShell with token
  console.log('Opening CloudShell...');
  await page.goto('https://cloudshell.coy.workers.dev/?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTc3MzU3Mjk2MCIsImlhdCI6MTc3MzU3Mjk2MTI3MywiZXhwIjoxNzczNjU5MzYxMjczfQ.w7j2cSe7YO5tUoSM4tDFzYm8vpLb6RwwcTQl7QD1I0o');
  
  // Wait for terminal to load
  await page.waitForTimeout(5000);
  
  // Get the terminal element and focus it
  const terminal = await page.$('.xterm-screen, .xterm, canvas');
  if (terminal) {
    await terminal.click();
  }
  
  // Demo script - 3-4 lines that loop well
  console.log('Recording demo commands...');
  
  // Line 1: Clear and welcome
  await page.keyboard.type('clear');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  await page.keyboard.type('echo "🚀 CloudShell - Terminal in the Cloud"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  // Line 2: Show installed tools
  await page.keyboard.type('echo "✓ Node $(node --version) · Python $(python3 --version | cut -d" " -f2) · Go $(go version | cut -d" " -f3)"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  
  // Line 3: Create a file (shows persistence)
  await page.keyboard.type('echo "Hello from CloudShell!" > welcome.txt && cat welcome.txt');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  
  // Line 4: Git status and tree
  await page.keyboard.type('git init quick-demo && cd quick-demo && git status');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  
  // Final pause before ending
  await page.waitForTimeout(1000);
  
  await context.close();
  await browser.close();
  
  console.log('✅ Demo recorded!');
  console.log(`📹 Video saved to: ${videoDir}`);
}

recordDemo().catch(console.error);