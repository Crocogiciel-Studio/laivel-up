import './styles.css';
import { parseEvaluation, type Evaluation } from './evaluation';
import { detectLang, persistLang, t, LANGS, type Lang } from './i18n';

/**
 * Scaffold entry point. Wires a no-server file drop that parses an evaluation.json
 * and echoes it. The actual rendered view (global verdict, per-axis bars,
 * criterion table, progression plan) is #41 viewer work, blocked on #21 and #42.
 */

let lang: Lang = detectLang();
let loaded: Evaluation | null = null;
let error: string | null = null;

const app = document.querySelector<HTMLElement>('#app');
if (app === null) {
  throw new Error('missing #app root');
}
const root = app;

function render(): void {
  root.replaceChildren();

  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.textContent = t(lang, 'app.title');
  const langBox = document.createElement('div');
  langBox.className = 'lang';
  const langLabel = document.createElement('label');
  langLabel.htmlFor = 'lang-select';
  langLabel.textContent = t(lang, 'lang.label');
  const select = document.createElement('select');
  select.id = 'lang-select';
  for (const code of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code.toUpperCase();
    opt.selected = code === lang;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    lang = select.value as Lang;
    persistLang(lang);
    render();
  });
  langBox.append(langLabel, select);
  header.append(h1, langBox);

  const tagline = document.createElement('p');
  tagline.className = 'tagline';
  tagline.textContent = t(lang, 'app.tagline');

  const dropzone = document.createElement('div');
  dropzone.className = 'dropzone';
  dropzone.tabIndex = 0;
  dropzone.setAttribute('role', 'button');
  const cta = document.createElement('div');
  cta.className = 'cta';
  cta.textContent = t(lang, 'drop.cta');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = t(lang, 'drop.hint');
  dropzone.append(cta, hint);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) {
      void ingest(file);
    }
  });

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
    if (file) {
      void ingest(file);
    }
  });

  root.append(header, tagline, dropzone, input);

  if (error !== null) {
    const status = document.createElement('p');
    status.className = 'status err';
    status.textContent = t(lang, 'loaded.error', { reason: error });
    root.append(status);
  } else if (loaded !== null) {
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = t(lang, 'loaded.ok', {
      subject: loaded.subjectId,
      grid: loaded.gridId,
    });
    const dump = document.createElement('pre');
    dump.className = 'dump';
    dump.textContent = JSON.stringify(loaded, null, 2);
    root.append(status, dump);
  }

  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.textContent = t(lang, 'scaffold.notice');
  root.append(notice);
}

async function ingest(file: File): Promise<void> {
  const text = await file.text();
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
