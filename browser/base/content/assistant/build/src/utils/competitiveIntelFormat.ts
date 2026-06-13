import type { CompetitiveIntelReport } from "../services/competitiveIntelTypes.js";
import type { ConfidenceLevel } from "../services/competitiveIntelTypes.js";

function confidenceBadge(level: ConfidenceLevel): string {
  return level.toUpperCase();
}

export function parseCompetitiveIntelFromAssistContent(
  content: unknown
): CompetitiveIntelReport | null {
  if (!content || typeof content !== "object") {
    if (typeof content === "string") {
      try {
        return parseCompetitiveIntelFromAssistContent(JSON.parse(content));
      } catch {
        return null;
      }
    }
    return null;
  }
  const record = content as Record<string, unknown>;
  if (
    typeof record.industry !== "string" ||
    typeof record.executiveSummary !== "string"
  ) {
    return null;
  }
  return record as unknown as CompetitiveIntelReport;
}

export function competitiveIntelToMarkdown(
  report: CompetitiveIntelReport
): string {
  const lines: string[] = [
    `# Competitive intelligence: ${report.industry}`,
    "",
    `**Overall confidence:** ${confidenceBadge(report.overallConfidence)}`,
    "",
    report.confidenceRationale,
    "",
    "## Executive summary",
    "",
    report.executiveSummary,
    "",
    "## Tier rationale",
    "",
  ];

  for (const tier of report.tierRationale || []) {
    lines.push(`### ${tier.tabGroupLabel}`, tier.whyRelevant, "");
  }

  lines.push("## Competitors", "");
  for (const competitor of report.competitors || []) {
    lines.push(
      `### ${competitor.name} (${competitor.tier}) — ${confidenceBadge(competitor.confidence)}`,
      "",
      `**Size signal:** ${competitor.sizeSignal}`,
      "",
      "**Differentiators:**",
      ...competitor.differentiators.map(item => `- ${item}`),
      "",
      "**Customer feedback themes:**",
      ...(competitor.customerFeedback.length
        ? competitor.customerFeedback.map(item => `- ${item}`)
        : ["- _(limited public feedback in sources)_"]),
      "",
      "**Vertical focus:**",
      ...competitor.verticalFocus.map(item => `- ${item}`),
      ""
    );
  }

  const matrix = report.comparisonMatrix;
  if (matrix?.dimensions?.length && matrix.cells?.length) {
    lines.push("## Comparison matrix", "");
    lines.push(
      `| Competitor | ${matrix.dimensions.join(" | ")} |`,
      `| --- | ${matrix.dimensions.map(() => "---").join(" | ")} |`
    );
    const competitors = [...new Set(matrix.cells.map(cell => cell.competitor))];
    for (const competitor of competitors) {
      const assessments = matrix.dimensions.map(dimension => {
        const cell = matrix.cells.find(
          item => item.competitor === competitor && item.dimension === dimension
        );
        return cell
          ? `${cell.assessment} (${confidenceBadge(cell.confidence)})`
          : "—";
      });
      lines.push(`| ${competitor} | ${assessments.join(" | ")} |`);
    }
    lines.push("");
  }

  if (report.gapsAndContradictions?.length) {
    lines.push("## Gaps and contradictions", "");
    for (const gap of report.gapsAndContradictions) {
      lines.push(`- ${gap}`);
    }
    lines.push("");
  }

  if (report.sources?.length) {
    lines.push("## Sources", "");
    for (const source of report.sources) {
      lines.push(
        `- [${source.title}](${source.url}) — ${source.status}${
          source.keyClaims?.length ? `: ${source.keyClaims[0]}` : ""
        }`
      );
    }
  }

  return lines.join("\n");
}
