import './styles.css';
import { parseEvaluation, evaluationSource, parseNameList, type Evaluation } from './evaluation';
import { buildViewModel, type AxisCard, type ViewModel } from './view-model';
import { detectLang, persistLang, t, LANGS, type Lang } from './i18n';

/**
 * Entry point. Renders an evaluation — dropped in, fetched from `?src=`, or one
 * of a `pnpm viz` catalogue you tab between — as the verdict, the per-axis
 * confidence and readings, and the progression plan.
 * Engine sentences stay English until #42; everything the UI labels is FR/EN.
 */

let lang: Lang = detectLang();
let loaded: Evaluation | null = null;
let error: string | null = null;
/** Non-null once a `pnpm viz` catalogue (evaluations/index.json) was found. */
let profiles: string[] | null = null;
let currentProfile: string | null = null;
const byProfile = new Map<string, Evaluation>();

const PROFILE_KEY = 'laivel-up.ui.profile';
const readStored = (): string | null => {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
};
const writeStored = (name: string): void => {
  try {
    localStorage.setItem(PROFILE_KEY, name);
  } catch {
    // best effort only.
  }
};

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

// ← / → step through the loaded profiles, unless a form control has focus.
document.addEventListener('keydown', (event) => {
  if (profiles === null || currentProfile === null) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  event.preventDefault();
  const step = event.key === 'ArrowRight' ? 1 : -1;
  const i = profiles.indexOf(currentProfile);
  const next = profiles[(i + step + profiles.length) % profiles.length];
  if (next !== undefined) selectProfile(next, true);
});

const PANEL_ID = 'evaluation-panel';

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

/** The verdict level for a catalogue profile, for its tab label. */
function profileLevel(name: string): string {
  const ev = byProfile.get(name);
  if (ev === undefined) return '';
  const v = buildViewModel(ev, lang).verdict;
  return v.ruled ? v.level : '—';
}

function tabs(): HTMLElement {
  const list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': t(lang, 'profile.label') });
  for (const name of profiles ?? []) {
    const selected = name === currentProfile;
    const tab = el(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(selected),
        'aria-controls': PANEL_ID,
        tabindex: selected ? '0' : '-1',
      },
      [el('span', { class: 'tab-name' }, [name]), el('span', { class: 'tab-level' }, [profileLevel(name)])],
    );
    tab.addEventListener('click', () => {
      selectProfile(name, false);
    });
    list.append(tab);
  }
  return list;
}

function axisCard(card: AxisCard): HTMLElement {
  const tagEls: HTMLElement[] = [];
  if (card.binding) tagEls.push(el('span', { class: 'tag tag-binding' }, [t(lang, 'axis.binding')]));
  if (!card.ruled) tagEls.push(el('span', { class: 'tag' }, [t(lang, 'axis.unknown')]));

  const head = el('div', { class: 'axis-head' }, [
    el('span', { class: 'axis-name' }, [card.name]),
    el('span', { class: 'axis-level' }, [card.level]),
    ...tagEls,
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
    el('div', { class: 'verdict-level' }, [
      vm.verdict.ruled ? vm.verdict.level : t(lang, 'verdict.unranked'),
    ]),
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
    el('p', { class: 'prog-target' }, [
      t(lang, 'progression.target', { level: vm.progression.targetLevel }),
    ]),
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

  const attrs: Attrs =
    profiles !== null ? { class: 'results', id: PANEL_ID, role: 'tabpanel', tabindex: '0' } : { class: 'results' };
  return el('div', attrs, [verdict, axes, progression, ...notes, raw]);
}

function langSelect(): HTMLElement {
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
  return el('div', { class: 'lang' }, [
    el('label', { for: 'lang-select' }, [t(lang, 'lang.label')]),
    select,
  ]);
}

function dropZone(): HTMLElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void ingest(file);
  });

  const compact = profiles !== null;
  const zone = el('div', { class: compact ? 'dropzone compact' : 'dropzone', tabindex: '0', role: 'button' }, [
    el('div', { class: 'cta' }, [t(lang, 'drop.cta')]),
    ...(compact ? [] : [el('div', { class: 'hint' }, [t(lang, 'drop.hint')])]),
    input,
  ]);
  zone.addEventListener('click', () => {
    input.click();
  });
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('is-dragover');
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) void ingest(file);
  });
  return zone;
}

function render(): void {
  document.documentElement.lang = lang;
  root.replaceChildren();

  root.append(
    el('header', {}, [el('h1', {}, [t(lang, 'app.title')]), el('div', { class: 'controls' }, [langSelect()])]),
  );

  if (profiles !== null && profiles.length > 0) {
    root.append(tabs());
  } else {
    root.append(el('p', { class: 'tagline' }, [t(lang, 'app.tagline')]));
  }

  root.append(dropZone());

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

function accept(text: string): void {
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

function selectProfile(name: string, focusTab: boolean): void {
  if (profiles === null || !profiles.includes(name)) return;
  currentProfile = name;
  writeStored(name);
  const ev = byProfile.get(name);
  loaded = ev ?? null;
  error = ev === undefined ? `evaluations/${name}.json failed to load` : null;
  render();
  if (focusTab) {
    document.querySelector<HTMLElement>('.tab[aria-selected="true"]')?.focus();
  } else {
    root.scrollIntoView({ block: 'start' });
  }
}

async function ingest(file: File): Promise<void> {
  try {
    accept(await file.text());
  } catch (cause) {
    loaded = null;
    error = (cause as Error).message;
    render();
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * Startup. `?src=<url>` wins. Then a `pnpm viz` catalogue — prefetch every
 * profile so tabbing is instant. Then a single co-located `evaluation.json`.
 * Otherwise the drop zone stands (e.g. opened from file://).
 */
async function autoload(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('src')) {
    const text = await fetchText(evaluationSource(window.location.search));
    if (text !== null) accept(text);
    return;
  }

  const names = parseNameList(await fetchText('evaluations/index.json'));
  if (names !== null && names.length > 0) {
    await Promise.all(
      names.map(async (name) => {
        const text = await fetchText(`evaluations/${encodeURIComponent(name)}.json`);
        const parsed = text === null ? null : parseEvaluation(text);
        if (parsed?.ok === true) byProfile.set(name, parsed.value);
      }),
    );
    const ready = names.filter((n) => byProfile.has(n));
    if (ready.length > 0) {
      profiles = ready;
      const remembered = readStored();
      currentProfile = remembered !== null && ready.includes(remembered) ? remembered : ready[0]!;
      loaded = byProfile.get(currentProfile) ?? null;
      render();
      return;
    }
  }

  // A dev server with nothing written yet answers this with its HTML shell —
  // parse quietly and leave the drop zone up rather than flashing an error.
  const single = await fetchText(evaluationSource(window.location.search));
  if (single !== null) {
    const parsed = parseEvaluation(single);
    if (parsed.ok) {
      loaded = parsed.value;
      error = null;
      render();
    }
  }
}

render();
void autoload();
