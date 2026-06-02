import test from "node:test";
import assert from "node:assert/strict";

import { ClarificationModal } from "../../ui-preact/src/components/ClarificationModal";

type VNodeLike = {
  type?: unknown;
  props?: Record<string, unknown>;
};

function flattenText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!node || typeof node !== "object") {
    return "";
  }
  const vnode = node as VNodeLike;
  const children = vnode.props?.children;
  if (Array.isArray(children)) {
    return children.map(flattenText).join(" ");
  }
  return flattenText(children);
}

function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
}

function collectButtons(node: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    return node.flatMap(collectButtons);
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const vnode = node as VNodeLike;
  const children = vnode.props?.children;
  const childNodes = Array.isArray(children)
    ? children
    : children
      ? [children]
      : [];
  const nested = childNodes.flatMap(collectButtons);
  return vnode.type === "button" ? [vnode.props ?? {}, ...nested] : nested;
}

function collectInputs(node: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    return node.flatMap(collectInputs);
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const vnode = node as VNodeLike;
  const children = vnode.props?.children;
  const childNodes = Array.isArray(children)
    ? children
    : children
      ? [children]
      : [];
  const nested = childNodes.flatMap(collectInputs);
  return vnode.type === "input" ? [vnode.props ?? {}, ...nested] : nested;
}

function collectNodesByProp(
  node: unknown,
  propName: string,
  propValue: unknown
): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    return node.flatMap(child =>
      collectNodesByProp(child, propName, propValue)
    );
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const vnode = node as VNodeLike;
  const children = vnode.props?.children;
  const childNodes = Array.isArray(children)
    ? children
    : children
      ? [children]
      : [];
  const nested = childNodes.flatMap(child =>
    collectNodesByProp(child, propName, propValue)
  );
  return vnode.props?.[propName] === propValue
    ? [vnode.props ?? {}, ...nested]
    : nested;
}

test("clarification modal renders generated options plus numbered none option", () => {
  const tree = ClarificationModal({
    data: {
      originalMessage: "show me the price",
      options: [
        {
          id: "opt_1",
          label: "Check this page",
          resolvedPrompt: "check this page",
        },
        {
          id: "opt_2",
          label: "Search the web",
          resolvedPrompt: "search the web",
        },
      ],
    },
    onSelect: () => {},
    directInputOpen: false,
    directInputValue: "",
    onOpenDirectInput: () => {},
    onDirectInputChange: () => {},
    onTellDirectly: () => {},
  });

  const buttons = collectButtons(tree);
  const labels = buttons.map(button =>
    normalizeLabel(flattenText({ props: { children: button.children } }))
  );

  assert.deepEqual(labels, [
    "1. Check this page",
    "2. Search the web",
    "3. None of these",
  ]);
});

test("clarification modal exposes dialog semantics", () => {
  const tree = ClarificationModal({
    data: {
      originalMessage: "show me the price",
      options: [
        {
          id: "opt_1",
          label: "Check this page",
          resolvedPrompt: "check this page",
        },
        {
          id: "opt_2",
          label: "Search the web",
          resolvedPrompt: "search the web",
        },
      ],
    },
    onSelect: () => {},
    directInputOpen: false,
    directInputValue: "",
    onOpenDirectInput: () => {},
    onDirectInputChange: () => {},
    onTellDirectly: () => {},
  });

  const dialogs = collectNodesByProp(tree, "role", "dialog");

  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0]["aria-modal"], "true");
  assert.equal(dialogs[0]["aria-labelledby"], "oasis-clarification-title");
});

test("clarification modal direct input submits on Enter", () => {
  let called = 0;
  let prevented = false;
  const tree = ClarificationModal({
    data: {
      originalMessage: "show me the price",
      options: [
        {
          id: "opt_1",
          label: "Check this page",
          resolvedPrompt: "check this page",
        },
        {
          id: "opt_2",
          label: "Search the web",
          resolvedPrompt: "search the web",
        },
      ],
    },
    onSelect: () => {},
    directInputOpen: true,
    directInputValue: "what did I read yesterday",
    onOpenDirectInput: () => {},
    onDirectInputChange: () => {},
    onTellDirectly: () => {
      called += 1;
    },
  });

  const input = collectInputs(tree)[0];

  assert.equal(input.placeholder, "Tell Oasis what you meant");
  (
    input.onKeyDown as (event: {
      key: string;
      preventDefault: () => void;
    }) => void
  )({
    key: "Enter",
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(called, 1);
  assert.equal(prevented, true);
});

test("clarification modal numeric keys match visible options", () => {
  const selected: string[] = [];
  let openedDirectInput = 0;
  const tree = ClarificationModal({
    data: {
      originalMessage: "show me the price",
      options: [
        {
          id: "opt_1",
          label: "Check this page",
          resolvedPrompt: "check this page",
        },
        {
          id: "opt_2",
          label: "Search the web",
          resolvedPrompt: "search the web",
        },
      ],
    },
    onSelect: optionId => {
      selected.push(optionId);
    },
    directInputOpen: false,
    directInputValue: "",
    onOpenDirectInput: () => {
      openedDirectInput += 1;
    },
    onDirectInputChange: () => {},
    onTellDirectly: () => {},
  });
  const dialog = collectNodesByProp(tree, "role", "dialog")[0];
  const preventDefault = () => {};
  const onKeyDown = dialog.onKeyDown as (event: {
    key: string;
    preventDefault: () => void;
  }) => void;

  onKeyDown({ key: "1", preventDefault });
  onKeyDown({ key: "2", preventDefault });
  onKeyDown({ key: "3", preventDefault });

  assert.deepEqual(selected, ["opt_1", "opt_2"]);
  assert.equal(openedDirectInput, 1);
});
