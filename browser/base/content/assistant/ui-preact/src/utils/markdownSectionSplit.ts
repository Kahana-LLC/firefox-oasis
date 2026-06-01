export type MarkdownSection = {
  id: string;
  title: string;
  markdown: string;
};

export function sectionIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

export function splitMarkdownAtH2(markdown: string): {
  preamble: string;
  sections: MarkdownSection[];
} {
  const trimmed = String(markdown || '').trimEnd();
  if (!trimmed) {
    return { preamble: '', sections: [] };
  }

  const lines = trimmed.split('\n');
  const preambleLines: string[] = [];
  const sections: MarkdownSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) {
      return;
    }
    sections.push({
      id: sectionIdFromTitle(currentTitle),
      title: currentTitle,
      markdown: currentLines.join('\n').trimEnd(),
    });
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    if (/^## /.test(line) && !line.startsWith('###')) {
      flush();
      currentTitle = line.slice(3).trim();
      currentLines = [line];
      continue;
    }
    if (currentTitle !== null) {
      currentLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  flush();

  return {
    preamble: preambleLines.join('\n').trimEnd(),
    sections,
  };
}
