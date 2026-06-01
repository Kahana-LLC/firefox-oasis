import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitMarkdownAtH2 } from '../src/utils/markdownSectionSplit.js';

describe('splitMarkdownAtH2', () => {
  it('splits multiple H2 sections and keeps H3 inside parent', () => {
    const md = [
      '# Research brief: AI privacy',
      '',
      '**Generated:** 2024-06-03',
      '',
      '## Executive summary',
      '',
      'Summary text.',
      '',
      '## Suggested outline',
      '',
      '### User reactions',
      '',
      '- bullet one',
      '',
      '## Themes',
      '',
      'Theme synthesis.',
    ].join('\n');

    const { preamble, sections } = splitMarkdownAtH2(md);
    assert.match(preamble, /^# Research brief:/);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, 'Executive summary');
    assert.match(sections[1].markdown, /^## Suggested outline/);
    assert.match(sections[1].markdown, /### User reactions/);
    assert.match(sections[1].markdown, /- bullet one/);
    assert.equal(sections[2].title, 'Themes');
  });

  it('returns preamble and one section when only one H2 exists', () => {
    const md = '# Title\n\n## Only section\n\nBody.';
    const { preamble, sections } = splitMarkdownAtH2(md);
    assert.equal(preamble, '# Title');
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Only section');
    assert.match(sections[0].markdown, /Body\./);
  });

  it('returns empty sections when no H2 headings exist', () => {
    const md = '# Research brief: Topic\n\n**Generated:** now';
    const { preamble, sections } = splitMarkdownAtH2(md);
    assert.match(preamble, /Research brief/);
    assert.equal(sections.length, 0);
  });
});
