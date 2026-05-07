import { h, render } from 'preact';
import { App } from './App';

const MOUNT_ID = 'assistant-preact-root';

function ensureRoot() {
  let root = document.getElementById(MOUNT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MOUNT_ID;
    const log = document.getElementById('log');
    if (log && log.parentElement) {
      log.parentElement.insertBefore(root, log);
    } else {
      document.body.appendChild(root);
    }
  }
  return root;
}

const root = ensureRoot();
document.getElementById('assistant-ui-loading')?.remove();
render(h(App, {}), root);
