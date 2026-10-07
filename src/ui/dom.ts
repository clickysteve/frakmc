/**
 * Small DOM toolkit for GEM-style objects positioned in ST pixels.
 *
 * Values change as in FMC2: LEFT mouse button decrements, RIGHT increments (swappable, like the
 * original's MS-BUTTONS). Modern extras: mouse wheel, arrow keys / +/− on a focused cell, and on
 * touch screens tapping the left/right half of a cell.
 */

export type Refresh = () => void;

export interface UiPrefs {
  /** true = left button increments */
  swapButtons(): boolean;
}

let prefs: UiPrefs = { swapButtons: () => false };
export function setUiPrefs(p: UiPrefs): void {
  prefs = p;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function place<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

/** A positioned element appended to `parent`. */
export function ob<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls: string, x: number, y: number, w: number, h: number, text = ''): HTMLElementTagNameMap[K] {
  const e = el(tag, `ob ${cls}`, text);
  place(e, x, y, w, h);
  parent.appendChild(e);
  return e;
}

export function label(parent: HTMLElement, x: number, y: number, w: number, h: number, text: string, cls = ''): HTMLDivElement {
  return ob(parent, 'div', `label ${cls}`, x, y, w, h, text);
}

export function box(parent: HTMLElement, x: number, y: number, w: number, h: number, cls = 'box'): HTMLDivElement {
  return ob(parent, 'div', cls, x, y, w, h);
}

export interface ButtonOpts {
  cls?: string;
  title?: string;
  disabled?: () => boolean;
  selected?: () => boolean;
  /** text that changes */
  text?: () => string;
}

export interface Btn {
  el: HTMLButtonElement;
  refresh: Refresh;
}

export function button(parent: HTMLElement, x: number, y: number, w: number, h: number, text: string, onClick: () => void, o: ButtonOpts = {}): Btn {
  const b = ob(parent, 'button', `btn ${o.cls ?? ''}`, x, y, w, h, text);
  b.type = 'button';
  if (o.title) b.title = o.title;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (o.disabled?.()) return;
    onClick();
  });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  const refresh = () => {
    const dis = o.disabled?.() ?? false;
    b.classList.toggle('dis', dis);
    b.setAttribute('aria-disabled', String(dis));
    if (o.selected) {
      const s = o.selected();
      b.classList.toggle('sel', s);
      b.setAttribute('aria-pressed', String(s));
    }
    if (o.text) b.textContent = o.text();
  };
  refresh();
  return { el: b, refresh };
}

export interface CellOpts {
  get: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  fmt?: (v: number) => string;
  title?: string | (() => string);
  cls?: string | (() => string);
  disabled?: () => boolean;
  /** ordered list of allowed values (overrides min/max stepping) */
  values?: () => number[];
  label?: string;
}

export interface Cell {
  el: HTMLDivElement;
  refresh: Refresh;
}

/** A numeric GEM cell: left button −, right button +. */
export function cell(parent: HTMLElement, x: number, y: number, w: number, h: number, o: CellOpts): Cell {
  const c = ob(parent, 'div', 'cell', x, y, w, h);
  c.tabIndex = 0;
  c.setAttribute('role', 'spinbutton');
  if (o.label) c.setAttribute('aria-label', o.label);
  const bump = (d: number) => {
    if (o.disabled?.()) return;
    const v = o.get();
    let n: number;
    const list = o.values?.();
    if (list) {
      const i = list.indexOf(v);
      n = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + Math.sign(d) * Math.max(1, Math.abs(d))))];
    } else n = Math.max(o.min, Math.min(o.max, v + d));
    if (n !== v) o.set(n);
  };
  let repeat: ReturnType<typeof setTimeout> | null = null;
  const stopRepeat = () => {
    if (repeat) clearTimeout(repeat);
    repeat = null;
  };
  c.addEventListener('pointerdown', (e) => {
    if (o.disabled?.()) return;
    e.preventDefault();
    c.focus();
    let d: number;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      const r = c.getBoundingClientRect();
      d = e.clientX < r.left + r.width / 2 ? -1 : 1;
    } else if (e.button === 0) d = prefs.swapButtons() ? 1 : -1;
    else if (e.button === 2) d = prefs.swapButtons() ? -1 : 1;
    else return;
    bump(d);
    const go = (delay: number) => {
      repeat = setTimeout(() => {
        bump(d);
        go(70);
      }, delay);
    };
    go(450);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) c.addEventListener(ev, stopRepeat);
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    bump((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1));
  }, { passive: false });
  c.addEventListener('keydown', (e) => {
    const k = e.key;
    const step = e.shiftKey ? 10 : 1;
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === '+' || k === '=') bump(step);
    else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === '-') bump(-step);
    else if (k === 'PageUp') bump(10);
    else if (k === 'PageDown') bump(-10);
    else if (k === 'Home' && !o.values) o.set(o.min);
    else if (k === 'End' && !o.values) o.set(o.max);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  const refresh = () => {
    const v = o.get();
    c.textContent = o.fmt ? o.fmt(v) : String(v);
    c.setAttribute('aria-valuenow', String(v));
    if (o.title) c.title = typeof o.title === 'function' ? o.title() : o.title;
    const extra = typeof o.cls === 'function' ? o.cls() : o.cls ?? '';
    c.className = `ob cell ${extra}${o.disabled?.() ? ' dis' : ''}`;
  };
  refresh();
  return { el: c, refresh };
}

/** Collects refreshers so a screen can update all its objects at once. */
export class Refreshers {
  private list: Refresh[] = [];
  add<T extends { refresh: Refresh }>(x: T): T {
    this.list.push(x.refresh);
    return x;
  }
  fn(f: Refresh): void {
    this.list.push(f);
  }
  run(): void {
    for (const f of this.list) f();
  }
}

export function download(name: string, data: string | Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }));
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Ask the browser for a file. Resolves null if cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = el('input');
    i.type = 'file';
    i.accept = accept;
    i.style.display = 'none';
    document.body.appendChild(i);
    let done = false;
    i.addEventListener('change', () => {
      done = true;
      resolve(i.files?.[0] ?? null);
      i.remove();
    });
    window.addEventListener('focus', () => setTimeout(() => {
      if (!done) {
        resolve(null);
        i.remove();
      }
    }, 600), { once: true });
    i.click();
  });
}
