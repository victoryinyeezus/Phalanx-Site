// A very small HTML parser and DOM, just enough to run this site's page
// scripts in Node without installing anything. It also fails on tags that
// don't close in order, which is how the tests check the HTML is well formed.
import vm from 'node:vm';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', rsquo: '’', lsquo: '‘', nbsp: ' ', copy: '©', hellip: '…', rarr: '→', times: '×' };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m;
  });
}

class Text {
  constructor(value) { this.value = value; this.parent = null; }
  get textContent() { return this.value; }
}

class Element {
  constructor(tag, attrs) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.parent = null;
    const self = this;
    this.dataset = new Proxy({}, {
      get(_, key) { return self.getAttribute('data-' + String(key).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())) ?? undefined; },
      set(_, key, value) { self.setAttribute('data-' + String(key).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value); return true; },
    });
    this.classList = {
      add: (c) => { const list = (self.getAttribute('class') || '').split(/\s+/).filter(Boolean); if (!list.includes(c)) list.push(c); self.setAttribute('class', list.join(' ')); },
      contains: (c) => (self.getAttribute('class') || '').split(/\s+/).includes(c),
    };
  }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  scrollIntoView() {}
  get id() { return this.getAttribute('id') || ''; }
  get href() { return this.getAttribute('href') || ''; }
  set href(value) { this.setAttribute('href', value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { const t = new Text(String(value)); t.parent = this; this.children = [t]; }
  *walk() { for (const c of this.children) { if (c instanceof Element) { yield c; yield* c.walk(); } } }
  // Supports "[attr]", "[attr=value]", "tag", "#id" and "tag[attr]".
  matches(selector) {
    const m = /^([a-z0-9]*)(?:#([\w-]+))?(?:\[([\w-]+)(?:="?([^"\]]*)"?)?\])?$/i.exec(selector.trim());
    if (!m) throw new Error('minidom: unsupported selector ' + selector);
    const [, tag, id, attr, value] = m;
    if (tag && this.tag !== tag.toLowerCase()) return false;
    if (id && this.id !== id) return false;
    if (attr && !this.hasAttribute(attr)) return false;
    if (attr && value !== undefined && this.getAttribute(attr) !== value) return false;
    return true;
  }
  // Class and descendant selectors (only the demo-video script uses them)
  // match nothing here, so that script stops early as it would without video.
  querySelectorAll(selector) {
    if (/[.\s]/.test(selector.trim().replace(/\[[^\]]*\]/g, ''))) return [];
    return [...this.walk()].filter((el) => el.matches(selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

export function parse(html, name = 'page') {
  const root = new Element('#document', new Map());
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/gi;
  let m;
  let line = 1;
  let last = 0;
  const at = (i) => { line += (html.slice(last, i).match(/\n/g) || []).length; last = i; return `${name}:${line}`; };
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (VOID.has(tag)) continue;
      if (top.tag !== tag) throw new Error(`${at(m.index)}: </${tag}> closes <${top.tag}>`);
      stack.pop();
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const attrs = new Map();
      const attrRe = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = attrRe.exec(m[3] || ''))) attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''));
      const el = new Element(tag, attrs);
      el.parent = top;
      top.children.push(el);
      if (RAW.has(tag)) {
        const close = html.toLowerCase().indexOf(`</${tag}>`, re.lastIndex);
        if (close === -1) throw new Error(`${at(m.index)}: <${tag}> never closes`);
        const t = new Text(html.slice(re.lastIndex, close));
        t.parent = el;
        el.children.push(t);
        re.lastIndex = close + tag.length + 3;
      } else if (!VOID.has(tag) && !m[4]) {
        stack.push(el);
      }
    } else if (m[5] !== undefined) {
      const t = new Text(decode(m[5]));
      t.parent = top;
      top.children.push(t);
    } else if (m[6]) {
      throw new Error(`${at(m.index)}: stray "<"`);
    }
  }
  if (stack.length !== 1) throw new Error(`${name}: <${stack[stack.length - 1].tag}> never closes`);
  root.getElementById = (id) => root.querySelector('#' + id);
  root.body = root.querySelector('body');
  return root;
}

// What a reader sees: text outside <script>/<style> and outside anything hidden.
export function visibleText(el) {
  if (el instanceof Text) return el.value;
  if (el.tag === 'script' || el.tag === 'style' || el.tag === 'head') return '';
  if (el.hasAttribute('hidden')) return '';
  return el.children.map(visibleText).join('');
}

// Runs a page's own scripts the way a browser would, at a fixed time.
// `files` maps a script src (like "pricing.js") to its source.
export function runPage(doc, { now, search = '', files = {} }) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    document: doc,
    location: { search },
    URLSearchParams,
    Date: FixedDate,
    encodeURIComponent,
    IntersectionObserver: undefined,
    matchMedia: () => ({ matches: true }),
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const script of doc.querySelectorAll('script')) {
    const type = script.getAttribute('type');
    if (type && type !== 'text/javascript') continue;
    const src = script.getAttribute('src');
    if (src) {
      if (!Object.prototype.hasOwnProperty.call(files, src)) throw new Error('runPage: no source given for ' + src);
      vm.runInContext(files[src], context, { filename: src });
    } else {
      vm.runInContext(script.textContent, context);
    }
  }
  return context;
}
