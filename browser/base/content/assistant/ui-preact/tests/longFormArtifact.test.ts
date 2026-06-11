import test from 'node:test';
import assert from 'node:assert/strict';

import { isLongFormAiArtifact } from '../src/utils/longFormArtifact.js';
import { RESEARCH_BRIEF_MARKER } from '../../build/src/utils/researchBriefRequest.js';
import { OUTREACH_EMAIL_MARKER } from '../../build/src/utils/outreachEmailRequest.js';

test('isLongFormAiArtifact detects research brief marker', () => {
  const content = `${RESEARCH_BRIEF_MARKER}\n{"markdown":"# Research brief: software"}`;
  assert.equal(isLongFormAiArtifact(content), true);
});

test('isLongFormAiArtifact detects outreach email marker', () => {
  const content = `${OUTREACH_EMAIL_MARKER}\n{"markdown":"# Outreach email"}`;
  assert.equal(isLongFormAiArtifact(content), true);
});

test('isLongFormAiArtifact detects multi-section markdown', () => {
  const content = [
    '# Summary',
    'Intro',
    '## Section one',
    'Body one',
    '## Section two',
    'Body two',
  ].join('\n');
  assert.equal(isLongFormAiArtifact(content), true);
});

test('isLongFormAiArtifact detects scope confirmation previews', () => {
  const preview =
    "I'll build a research brief from 10 tab(s) in Relevant tabs (software). Tabs: Homebrew, mimo code, Zed blog, +7 more. 8 tab(s) in scope will be skipped due to the tab limit. Continue?";
  assert.equal(isLongFormAiArtifact(preview), true);
});

test('isLongFormAiArtifact detects organize preview lists', () => {
  const preview = [
    "I'll organize tabs in Window into 3 group(s):",
    '- "llms" (4 tabs): Anthropic, Open R1',
    '- "shopping" (2 tabs): Amazon',
    'Continue?',
  ].join('\n');
  assert.equal(isLongFormAiArtifact(preview), true);
});

test('isLongFormAiArtifact ignores short status replies', () => {
  assert.equal(isLongFormAiArtifact('Opened Gmail in a new tab.'), false);
  assert.equal(isLongFormAiArtifact('Action cancelled.'), false);
});
