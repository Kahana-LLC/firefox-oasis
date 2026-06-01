import type { OasisWindow } from '../types';

const RESEARCH_BRIEF_MARKER = '__RESEARCH_BRIEF__';

const win = window as OasisWindow;

export function textForClipboard(raw: string): string {
  const text = String(raw || '');
  const markerIndex = text.indexOf(RESEARCH_BRIEF_MARKER);
  if (markerIndex < 0) {
    return text.trim();
  }

  const jsonText = text
    .slice(markerIndex + RESEARCH_BRIEF_MARKER.length)
    .trim();
  try {
    const parsed = JSON.parse(jsonText) as { markdown?: string };
    if (typeof parsed.markdown === 'string' && parsed.markdown.trim()) {
      return parsed.markdown.trim();
    }
  } catch {
    // fall through
  }

  return text.slice(0, markerIndex).trim();
}

export function isResearchBriefMarkdown(raw: string): boolean {
  const text = textForClipboard(raw);
  return /^# Research brief:/m.test(text);
}

export function markdownToSafeHtml(markdown: string): string {
  if (!win.marked || !win.DOMPurify) {
    return '';
  }
  try {
    const raw = win.marked.parse(markdown);
    return win.DOMPurify.sanitize(raw);
  } catch {
    return '';
  }
}

async function writePlainText(plain: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }
  await navigator.clipboard.writeText(plain);
  return true;
}

export async function copyMarkdownToClipboard(raw: string): Promise<boolean> {
  const plain = textForClipboard(raw);
  if (!plain) {
    return false;
  }

  const html = markdownToSafeHtml(plain);

  try {
    if (
      html &&
      typeof ClipboardItem !== 'undefined' &&
      navigator.clipboard?.write
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    return await writePlainText(plain);
  } catch {
    try {
      return await writePlainText(plain);
    } catch {
      return false;
    }
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  return copyMarkdownToClipboard(text);
}
