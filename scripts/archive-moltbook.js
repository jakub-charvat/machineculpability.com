#!/usr/bin/env node

/**
 * Moltbook Archive Script
 *
 * Archives a post from moltbook.com to the machineculpability.com archive section.
 *
 * Usage:
 *   node archive-moltbook.js <url> "<curator_comment>"
 *
 * Example:
 *   node archive-moltbook.js "https://www.moltbook.com/post/34809c74-eed2-48d0-b371-e1b5b940d409" "Interesting perspective on AI autonomy"
 *
 * Requirements:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function archivePost(url, curatorComment) {
  console.log(`\n📦 Archiving: ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for content to load (moltbook uses client-side rendering)
    await page.waitForSelector('[class*="post"], article, .content', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // Extra wait for dynamic content

    // Extract post data
    const data = await page.evaluate(() => {
      // Try various selectors that moltbook might use
      const getTextContent = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim();
        }
        return null;
      };

      // Get main content - try multiple approaches
      const contentSelectors = [
        '.post-content', '.post-body', '.content', 'article p',
        '[class*="content"]', '[class*="body"]', 'main p'
      ];

      let content = '';
      for (const sel of contentSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          content = Array.from(els).map(el => el.textContent.trim()).join('\n\n');
          if (content.length > 50) break;
        }
      }

      // If still no content, get all paragraph text
      if (!content || content.length < 50) {
        content = Array.from(document.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(t => t.length > 20)
          .join('\n\n');
      }

      return {
        title: getTextContent(['h1', '.post-title', '[class*="title"]', 'title']) || 'Untitled',
        author: getTextContent(['.author', '.post-author', '[class*="author"]', '.username']) || 'Unknown',
        submolt: getTextContent(['.submolt', '[class*="submolt"]', '[class*="community"]', '[href*="/m/"]']) || 'm/general',
        content: content || 'Content could not be extracted',
        date: new Date().toISOString().split('T')[0]
      };
    });

    await browser.close();

    // Clean up title for slug
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60)
      .replace(/-$/, '');

    // Generate markdown content
    const markdown = `---
title: "${data.title.replace(/"/g, '\\"')}"
slug: "${slug}"
date: ${data.date}
description: "Archived from Moltbook"
moltbook_author: "${data.author}"
moltbook_submolt: "${data.submolt}"
moltbook_url: "${url}"
curator_comment: "${curatorComment.replace(/"/g, '\\"')}"
tags: ["moltbook", "archive"]
---

${data.content}
`;

    // Write file
    const contentDir = path.join(__dirname, '..', 'content', 'archive');
    const filename = `${slug}.en.md`;
    const filepath = path.join(contentDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    fs.writeFileSync(filepath, markdown);
    console.log(`✅ Created: ${filepath}\n`);

    // Show extracted data
    console.log('📄 Extracted data:');
    console.log(`   Title: ${data.title}`);
    console.log(`   Author: ${data.author}`);
    console.log(`   Submolt: ${data.submolt}`);
    console.log(`   Content length: ${data.content.length} chars\n`);

    // Ask about git commit
    console.log('🔧 To commit and push:');
    console.log(`   git add content/archive/${filename}`);
    console.log(`   git commit -m "Archive: ${data.title.substring(0, 50)}"`);
    console.log(`   git push\n`);

    return { success: true, filepath, data };

  } catch (error) {
    await browser.close();
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

// CLI handling
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log(`
Moltbook Archive Script
=======================

Usage:
  node archive-moltbook.js <url> [curator_comment]

Example:
  node archive-moltbook.js "https://www.moltbook.com/post/UUID" "Relevant for AI liability discussion"

Setup (first time):
  cd scripts
  npm install
  npx playwright install chromium
`);
  process.exit(1);
}

const url = args[0];
const comment = args[1] || 'Archived for reference.';

archivePost(url, comment);
