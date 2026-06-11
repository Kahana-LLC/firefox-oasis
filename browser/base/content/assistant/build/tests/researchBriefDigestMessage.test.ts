import test from "node:test";
import assert from "node:assert/strict";

import { formatUnreadableDigestsMessage } from "../src/services/researchBriefFormat.js";

test("formatUnreadableDigestsMessage lists tab titles and failure reasons", () => {
  const message = formatUnreadableDigestsMessage(
    [
      {
        title: "Software Is Made Between Commits",
        url: "https://example.com/software",
        content: "",
        status: "failed",
        failureReason: "Page may still be loading or is not accessible.",
      },
      {
        title: "Homebrew",
        url: "https://brew.sh",
        content: "",
        status: "failed",
        failureReason: "Not enough readable content on this page.",
      },
    ],
    "Tabs related to: software"
  );

  assert.match(message, /Software Is Made Between Commits/);
  assert.match(message, /Homebrew/);
  assert.match(message, /not accessible/i);
  assert.match(message, /Tabs related to: software/);
});
