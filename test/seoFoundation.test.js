import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const p = (...parts) => path.resolve(process.cwd(), ...parts);
const read = (...parts) => fs.readFileSync(p(...parts), 'utf8');

test('homepage exposes canonical discovery metadata and software schema', () => {
  const html = read('public','index.html');
  assert.match(html, /<title>Mimir — AI CV Evaluator for Recruiters/);
  assert.match(html, /rel="canonical" href="https:\/\/mimir\.co\.in\/"/);
  assert.match(html, /"@type": \["WebApplication", "SoftwareApplication"\]/);
  assert.match(html, /"name": "Mimir"/);
  assert.match(html, /Evidence-Based AI CV Evaluator for Recruiters/);
});

test('robots and sitemap make SEO pages discoverable while excluding API', () => {
  const robots = read('public','robots.txt');
  const sitemap = read('public','sitemap.xml');
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/mimir\.co\.in\/sitemap\.xml/);
  for (const route of ['cv-evaluator','ai-cv-screening','cv-jd-matching','how-mimir-works','evidence-based-recruitment','gdpr-ai-recruitment','eu-ai-act-recruitment','privacy','about']) {
    assert.match(sitemap, new RegExp(`https://mimir\.co\.in/${route}/`));
    const html = read('public',route,'index.html');
    assert.match(html, /<h1>/);
    assert.match(html, new RegExp(`rel="canonical" href="https://mimir\.co\.in/${route}/"`));
  }
});

test('SEO page titles are unique', () => {
  const routes=['cv-evaluator','ai-cv-screening','cv-jd-matching','how-mimir-works','evidence-based-recruitment','gdpr-ai-recruitment','eu-ai-act-recruitment','privacy','about'];
  const titles=routes.map(route => read('public',route,'index.html').match(/<title>(.*?)<\/title>/)?.[1]);
  assert.equal(new Set(titles).size, titles.length);
});

test('unknown public paths use a noindex 404 document', () => {
  const app = read('src','appFactory.js');
  const notFound = read('public','404.html');
  assert.match(app, /res\.status\(404\)\.sendFile/);
  assert.match(notFound, /name="robots" content="noindex,follow"/);
});
