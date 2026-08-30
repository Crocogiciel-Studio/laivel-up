import './styles.css';
import { parseEvaluation, type Evaluation } from './evaluation';
import { buildViewModel, type AxisCard, type ViewModel } from './view-model';
import { detectLang, persistLang, t, LANGS, type Lang } from './i18n';

/**
 * Entry point. A no-server file drop parses an evaluation.json and renders the
 * verdict, the per-axis confidence and readings, and the progression plan.
 * Engine sentences stay English until #42; everything the UI labels is FR/EN.
 */

let lang: Lang = detectLang();
let loaded: Evaluation | null = null;
let error: string | null = null;

const app = document.querySelector<HTMLElement>('#app');
if (app === null) {
  throw new Error('missing #app root');
}
const root = app;

// A file dropped outside the dropzone would otherwise navigate the tab away.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault();
  });
}

type Attrs = Record<string, string>;

function el(tag: string, attrs: Attrs = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function meter(pct: number): HTMLElement {
  const fill = el('span', { class: 'meter-fill', style: `width:${String(pct)}%` });
  return el('span', { class: 'meter', role: 'img', 'aria-label': `${String(pct)}%` }, [fill]);
}

function axisCard(card: AxisCard): HTMLElement {
  const tags: HTMLElement[] = [];
  if (card.binding) tags.push(el('span', { class: 'tag tag-binding' }, [t(lang, 'axis.binding')]));
  if (!card.ruled) tags.push(el('span', { class: 'tag' }, [t(lang, 'axis.unknown')]));

  const head = el('div', { class: 'axis-head' }, [
    el('span', { class: 'axis-name' }, [card.name]),
    el('span', { class: 'axis-level' }, [card.level]),
    ...tags,
  ]);

  const sub = el('div', { class: 'axis-sub' }, [
    t(lang, 'axis.confidence', { pct: String(card.confidencePct) }),
    ' · ',
    t(lang, 'axis.limitedBy', { factor: card.limitingFactor }),
  ]);

  const rows = card.readings.map((r) =>
    el('tr', r.ruled ? {} : { class: 'is-unknown' }, [
      el('td', {}, [r.criterion]),
      el('td', {}, [r.role]),
      el('td', {}, [r.status]),
      el('td', {}, [r.level]),
      el('td', { class: 'num' }, [r.raw]),
      el('td', { class: 'num' }, [`${String(r.confidencePct)}%`]),
      el('td', { class: 'evidence' }, [r.evidence]),
    ]),
  );

  const table = el('table', { class: 'readings' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, [t(lang, 'reading.criterion')]),
        el('th', {}, [t(lang, 'reading.role')]),
        el('th', {}, [t(lang, 'reading.status')]),
        el('th', {}, [t(lang, 'reading.level')]),
        el('th', { class: 'num' }, [t(lang, 'reading.raw')]),
        el('th', { class: 'num' }, [t(lang, 'reading.confidence')]),
        el('th', {}, [t(lang, 'reading.evidence')]),
      ]),
    ]),
    el('tbody', {}, rows),
  ]);

  return el('article', { class: card.binding ? 'axis is-binding' : 'axis' }, [
    head,
    sub,
    meter(card.confidencePct),
    el('div', { class: 'readings-wrap' }, [table]),
  ]);
}

function results(vm: ViewModel): HTMLElement {
  const verdict = el('section', { class: 'verdict' }, [
    el('div', { class: 'verdict-label' }, [t(lang, 'verdict.heading')]),
    el('div', { class: 'verdict-level' }, [vm.verdict.ruled ? vm.verdict.level : t(lang, 'verdict.unranked')]),
    el('div', { class: 'verdict-meta' }, [
      t(lang, 'verdict.for', { subject: vm.subjectId, grid: vm.gridId }),
    ]),
    el('div', { class: 'verdict-meta' }, [
      t(lang, 'verdict.confidence', { pct: String(vm.verdict.confidencePct) }),
      ...(vm.verdict.bindingAxis === null
        ? []
        : [' · ', t(lang, 'verdict.binding', { axis: vm.verdict.bindingAxis })]),
    ]),
    ...(vm.verdict.note === '' ? [] : [el('div', { class: 'verdict-note' }, [vm.verdict.note])]),
  ]);

  const axes = el('section', { class: 'axes' }, [
    el('h2', {}, [t(lang, 'axes.heading')]),
    ...vm.axes.map(axisCard),
  ]);

  const progression = el('section', { class: 'progression' }, [
    el('h2', {}, [t(lang, 'progression.heading')]),
    el('p', { class: 'prog-target' }, [t(lang, 'progression.target', { level: vm.progression.targetLevel })]),
    el(
      'ul',
      {},
      vm.progression.actions.map((a) => el('li', {}, [a])),
    ),
  ]);

  const notes: HTMLElement[] = [el('p', { class: 'note' }, [t(lang, 'engine.note')])];
  if (!vm.gridKnown) {
    notes.unshift(el('p', { class: 'note' }, [t(lang, 'grid.unknown', { grid: vm.gridId })]));
  }

  const raw = el('details', { class: 'raw' }, [
    el('summary', {}, [t(lang, 'raw.summary')]),
    el('pre', {}, [JSON.stringify(loaded, null, 2)]),
  ]);

  return el('div', { class: 'results' }, [verdict, axes, progression, ...notes, raw]);
}

function render(): void {
  document.documentElement.lang = lang;
  root.replaceChildren();

  const select = el('select', { id: 'lang-select' });
  for (const code of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code.toUpperCase();
    opt.selected = code === lang;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    lang = (select as HTMLSelectElement).value as Lang;
    persistLang(lang);
    render();
  });

  const header = el('header', {}, [
    el('h1', {}, [t(lang, 'app.title')]),
    el('div', { class: 'lang' }, [
      el('label', { for: 'lang-select' }, [t(lang, 'lang.label')]),
      select,
    ]),
  ]);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void ingest(file);
  });

  const dropzone = el('div', { class: 'dropzone', tabindex: '0', role: 'button' }, [
    el('div', { class: 'cta' }, [t(lang, 'drop.cta')]),
    el('div', { class: 'hint' }, [t(lang, 'drop.hint')]),
  ]);
  dropzone.addEventListener('click', () => {
    input.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('is-dragover');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) void ingest(file);
  });

  root.append(header, el('p', { class: 'tagline' }, [t(lang, 'app.tagline')]), dropzone, input);

  if (error !== null) {
    root.append(
      el('p', { class: 'status err', 'aria-live': 'polite' }, [
        t(lang, 'loaded.error', { reason: error }),
      ]),
    );
  } else if (loaded !== null) {
    root.append(results(buildViewModel(loaded, lang)));
  }
}

async function ingest(file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch (cause) {
    loaded = null;
    error = (cause as Error).message;
    render();
    return;
  }
  const result = parseEvaluation(text);
  if (result.ok) {
    loaded = result.value;
    error = null;
  } else {
    loaded = null;
    error = result.error;
  }
  render();
}

render();
