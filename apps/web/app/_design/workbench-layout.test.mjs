import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('workbench uses the full-width layout instead of reserving an empty secondary rail', () => {
  const renderer = read('./renderer.tsx');
  const css = read('./design-system.css');

  assert.match(renderer, /const secondaryNavigation = \(ADMIN_SECONDARY_NAVIGATION\[screen\.area\]/);
  assert.match(read('./admin-navigation.ts'), /'设置': \[/);
  assert.match(read('./admin-navigation.ts'), /group\('架构与知识', \[\['系统架构', '\/admin\/architecture'\]\]\)/);
  assert.doesNotMatch(renderer, /scopedMenus|menuDestination|screen\.secondary/);
  assert.match(renderer, /av-body\$\{hasSecondaryNavigation \? '' : ' av-body--wide'\}/);
  assert.match(renderer, /\{hasSecondaryNavigation \? \(/);
  assert.doesNotMatch(renderer, /\) : \(\s*<div \/>\s*\)}/);
  assert.match(css, /\.av-body--wide\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.av-body--wide > \.av-workspace\s*\{[^}]*max-width:\s*1760px/s);
});

test('workbench typography and dashboard card spacing remain readable', () => {
  const css = read('./design-system.css');
  const renderer = read('./renderer.tsx');

  assert.match(css, /\.av-pagetitle\s*\{[^}]*font-size:\s*26px/s);
  assert.match(css, /\.av-cardtitle\s*\{[^}]*font-size:\s*15px/s);
  assert.match(css, /\.av-kpivalue\s*\{[^}]*font-size:\s*28px/s);
  assert.match(css, /\.av-kpis > \.av-card\s*\{\s*margin-top:\s*0/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(renderer, /screen\.id !== 'workbench' && screen\.sourceNode/);
});

