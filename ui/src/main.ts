import './styles.css';
import { parseEvaluation, evaluationSource, type Evaluation } from './evaluation';
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
/** Populated when `pnpm viz` (no arg) has written an evaluations/ catalogue. */
let profiles: string[] | null = null;
let currentProfile: string | null = null;

const PROFILE_KEY = 'laivel-up.ui.profile';
const readProfile = (): string | null => {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
};
const writeProfile = (name: string): void => {
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

  const controls: HTMLElement[] = [];
  if (profiles !== null && profiles.length > 0) {
    const pick = el('select', { id: 'profile-select' });
    for (const name of profiles) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      opt.selected = name === currentProfile;
      pick.append(opt);
    }
    pick.addEventListener('change', () => {
      currentProfile = (pick as HTMLSelectElement).value;
      writeProfile(currentProfile);
      void loadProfile(currentProfile);
    });
    controls.push(
      el('div', { class: 'lang' }, [
        el('label', { for: 'profile-select' }, [t(lang, 'profile.label')]),
        pick,
      ]),
    );
  }
  controls.push(
    el('div', { class: 'lang' }, [
      el('label', { for: 'lang-select' }, [t(lang, 'lang.label')]),
      select,
    ]),
  );

  const header = el('header', {}, [
    el('h1', {}, [t(lang, 'app.title')]),
    el('div', { class: 'controls' }, controls),
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

async function loadProfile(name: string): Promise<void> {
  const text = await fetchText(`evaluations/${encodeURIComponent(name)}.json`);
  if (text !== null) accept(text);
}

/** A JSON array of strings, or null — the dev server answers a missing file with the HTML shell. */
function parseNameList(text: string | null): string[] | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every((n) => typeof n === 'string') ? (value as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Startup. `?src=<url>` wins. Then a `pnpm viz` catalogue
 * (`evaluations/index.json` + a per-profile picker). Then a single co-located
 * `evaluation.json`. Otherwise the drop zone stands (e.g. opened from file://).
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
    profiles = names;
    const remembered = readProfile();
    currentProfile = remembered !== null && names.includes(remembered) ? remembered : names[0]!;
    await loadProfile(currentProfile);
    return;
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
