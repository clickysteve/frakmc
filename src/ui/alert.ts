/**
 * GEM form_alert boxes and simple modal dialogs, drawn inside the ST screen.
 */
import { el, place } from './dom';

let layerEl: HTMLElement | null = null;
export function setAlertLayer(l: HTMLElement): void {
  layerEl = l;
}

/** true while a modal is open (global key handlers stand aside) */
export let modalOpen = 0;

const ICONS = ['', '!', '?', 'X'];

/**
 * Show an alert. `icon` 0 none, 1 note (!), 2 question (?), 3 stop. Resolves with the index of
 * the chosen button. Return picks the default button; Escape the last one.
 */
export function alertBox(icon: 0 | 1 | 2 | 3, lines: string[], buttons: string[], defaultIndex = 0): Promise<number> {
  const layer = layerEl!;
  return new Promise((resolve) => {
    modalOpen++;
    const shade = el('div', 'alert-shade');
    const a = el('div', 'alert');
    a.setAttribute('role', 'alertdialog');
    const ic = el('div', ICONS[icon] ? 'icon' : '', ICONS[icon]);
    const tx = el('div', 'lines', lines.join('\n'));
    a.append(ic, tx);
    const row = el('div', 'buttons');
    const finish = (i: number) => {
      modalOpen--;
      document.removeEventListener('keydown', onKey, true);
      shade.remove();
      resolve(i);
    };
    buttons.forEach((b, i) => {
      const btn = el('button', `btn shadow${i === defaultIndex ? ' default' : ''}`, b);
      btn.type = 'button';
      btn.addEventListener('click', () => finish(i));
      row.appendChild(btn);
    });
    a.appendChild(row);
    shade.appendChild(a);
    layer.appendChild(shade);
    // centre on the 640×400 screen
    const w = a.offsetWidth, h = a.offsetHeight;
    place(a, Math.round((640 - w) / 2), Math.round((400 - h) / 2));
    (row.children[defaultIndex] as HTMLElement)?.focus();
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      // a key that closed the previous dialog must not answer this one
      if (performance.now() - opened < 100 || e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter') finish(defaultIndex);
      else if (e.key === 'Escape') finish(buttons.length - 1);
      else if (/^[1-9]$/.test(e.key) && +e.key <= buttons.length) finish(+e.key - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
  });
}

export interface ModalHandle {
  root: HTMLDivElement;
  close: () => void;
}

/**
 * A modal GEM dialog of w×h ST pixels, centred. `build` fills it. Escape closes (calling
 * onClose). Resolves when closed.
 */
export function modal(w: number, h: number, build: (m: ModalHandle) => void, onEscape?: () => void): Promise<void> {
  const layer = layerEl!;
  return new Promise((resolve) => {
    modalOpen++;
    const shade = el('div', 'alert-shade');
    const root = el('div', 'dlg');
    place(root, Math.round((640 - w) / 2), Math.round((400 - h) / 2), w, h);
    shade.appendChild(root);
    layer.appendChild(shade);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      modalOpen--;
      document.removeEventListener('keydown', onKey, true);
      shade.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    build({ root, close });
  });
}
