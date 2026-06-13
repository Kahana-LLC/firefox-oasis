import type { CompetitiveCompany } from "../services/competitiveIntelTypes.js";
import { DEFAULT_COMPETITIVE_TIERS } from "../services/competitiveIntelTypes.js";

function tierLabel(tier: string): string {
  const normalized = String(tier || "")
    .trim()
    .toLowerCase();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Medium";
}

function escapeCsvCell(value: string): string {
  const text = String(value || "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function tierTableToMarkdown(companies: CompetitiveCompany[]): string {
  const lines = ["## Proposed competitor tiers", ""];
  for (const tier of DEFAULT_COMPETITIVE_TIERS) {
    const group = companies.filter(company => company.tier === tier);
    if (group.length === 0) continue;
    lines.push(`### ${tierLabel(tier)} (${group.length})`);
    lines.push("");
    lines.push("| Company | Mentions | Description |");
    lines.push("| --- | ---: | --- |");
    for (const company of group) {
      lines.push(
        `| ${company.name} | ${company.mentionCount} | ${company.description || "—"} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function tierTableToTsv(companies: CompetitiveCompany[]): string {
  const rows = ["Tier\tCompany\tMentions\tDescription"];
  for (const tier of DEFAULT_COMPETITIVE_TIERS) {
    for (const company of companies.filter(item => item.tier === tier)) {
      rows.push(
        [
          tierLabel(tier),
          company.name,
          String(company.mentionCount),
          company.description || "",
        ].join("\t")
      );
    }
  }
  return rows.join("\n");
}

export function tierTableToCsv(companies: CompetitiveCompany[]): string {
  const rows = ["Tier,Company,Mentions,Description"];
  for (const tier of DEFAULT_COMPETITIVE_TIERS) {
    for (const company of companies.filter(item => item.tier === tier)) {
      rows.push(
        [
          escapeCsvCell(tierLabel(tier)),
          escapeCsvCell(company.name),
          escapeCsvCell(String(company.mentionCount)),
          escapeCsvCell(company.description || ""),
        ].join(",")
      );
    }
  }
  return rows.join("\n");
}

export function comparisonMatrixToMarkdown(
  report: import("../services/competitiveIntelTypes.js").CompetitiveIntelReport
): string {
  const matrix = report.comparisonMatrix;
  if (!matrix?.dimensions?.length || !matrix.cells?.length) {
    return "";
  }
  const competitors = [...new Set(matrix.cells.map(cell => cell.competitor))];
  const lines = ["## Comparison matrix", ""];
  lines.push(`| Competitor | ${matrix.dimensions.join(" | ")} |`);
  lines.push(`| --- | ${matrix.dimensions.map(() => "---").join(" | ")} |`);
  for (const competitor of competitors) {
    const cells = matrix.dimensions.map(dimension => {
      const cell = matrix.cells.find(
        item => item.competitor === competitor && item.dimension === dimension
      );
      return cell?.assessment || "—";
    });
    lines.push(`| ${competitor} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

export function comparisonMatrixToTsv(
  report: import("../services/competitiveIntelTypes.js").CompetitiveIntelReport
): string {
  const matrix = report.comparisonMatrix;
  if (!matrix?.dimensions?.length || !matrix.cells?.length) {
    return "";
  }
  const competitors = [...new Set(matrix.cells.map(cell => cell.competitor))];
  const rows = [`Competitor\t${matrix.dimensions.join("\t")}`];
  for (const competitor of competitors) {
    const cells = matrix.dimensions.map(dimension => {
      const cell = matrix.cells.find(
        item => item.competitor === competitor && item.dimension === dimension
      );
      return cell?.assessment || "";
    });
    rows.push([competitor, ...cells].join("\t"));
  }
  return rows.join("\n");
}
