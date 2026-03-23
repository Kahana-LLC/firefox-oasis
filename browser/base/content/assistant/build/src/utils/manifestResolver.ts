/**
 * Manifest resolver — finds the best matching manifest entry.
 *
 * Scores user input against all phrases in COMMAND_MANIFEST using
 * normalized string matching (exact=1.0, prefix=0.9, contains=0.75).
 * Returns the highest-scoring ManifestResolution or null.
 * Used by manifestList/Search/MutationResolver to identify the
 * command family and candidate command name.
 */
import { normalizeRouteName } from "./intentParser.js";
import { COMMAND_MANIFEST } from "./commandManifest.js";
import type {
  ManifestCommandDefinition,
  ManifestConditionContext,
  ManifestResolution,
} from "./manifestTypes.js";

function phraseMatchScore(input: string, phrase: string): number {
  const source = normalizeRouteName(input);
  const target = normalizeRouteName(phrase);
  if (!source || !target) {
    return 0;
  }
  if (source === target) {
    return 1;
  }
  if (source.startsWith(target)) {
    return 0.9;
  }
  if (source.includes(target)) {
    return 0.75;
  }
  return 0;
}

function checkCondition(
  definition: ManifestCommandDefinition,
  context: ManifestConditionContext
): boolean {
  if (!definition.condition) {
    return true;
  }
  return definition.condition(context);
}

export function resolveManifestCandidates(
  input: string,
  context: ManifestConditionContext,
  manifest: readonly ManifestCommandDefinition[] = COMMAND_MANIFEST
): ManifestResolution[] {
  const normalizedInput = normalizeRouteName(input);
  if (!normalizedInput) {
    return [];
  }

  const candidates: ManifestResolution[] = [];
  for (const definition of manifest) {
    if (!checkCondition(definition, context)) {
      continue;
    }
    let bestScore = 0;
    for (const phrase of definition.phrases) {
      const score = phraseMatchScore(normalizedInput, phrase);
      if (score > bestScore) {
        bestScore = score;
      }
    }
    if (bestScore <= 0) {
      continue;
    }
    candidates.push({
      definition,
      args: {},
      score: bestScore + (definition.priority || 0) * 0.01,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function resolveManifestCommand(
  input: string,
  context: ManifestConditionContext,
  manifest: readonly ManifestCommandDefinition[] = COMMAND_MANIFEST
): ManifestResolution | null {
  const candidates = resolveManifestCandidates(input, context, manifest);
  return candidates[0] || null;
}
