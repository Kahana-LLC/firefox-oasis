export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function openPrintFriendlyWindow(title: string, htmlBody: string): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    return;
  }
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
  h1, h2, h3 { margin-top: 1.5rem; }
</style>
</head>
<body>${htmlBody}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
