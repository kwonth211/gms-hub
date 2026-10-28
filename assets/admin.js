// Admin editor: loads data/*.json through the GitHub API and commits edits back.
// The push triggers the Pages workflow, which rebuilds and redeploys the site.
const repo = JSON.parse(document.getElementById('admin-config').textContent);
const rootEl = document.getElementById('admin-root');
const API = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/`;
const TOKEN_KEY = 'cb_admin_token';

const FILES = [
  { path: 'data/drops.json', label: '드롭 확률', editor: 'drops' },
  { path: 'data/scrolls.json', label: '주문서 등급 확률', editor: 'scrolls' },
  { path: 'data/training.json', label: '사냥터', editor: 'json' },
  { path: 'data/sites.json', label: '사이트 링크', editor: 'json' }
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = () => new Date().toISOString().slice(0, 10);
const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
};
const setToken = (v) => {
  try {
    v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
};

const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const encode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

async function gh(path, opts = {}) {
  const res = await fetch(API + path + (opts.method ? '' : `?ref=${repo.branch}`), {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json().catch(() => ({}))).message || res.statusText}`);
  return res.json();
}

let current = null; // { file, data, sha }

function loginView() {
  rootEl.innerHTML = `<section class="prose">
<h1>관리자 로그인</h1>
<p>GitHub <strong>Fine-grained personal access token</strong>을 입력하세요. 권한은 <code>${esc(repo.owner)}/${esc(repo.repo)}</code> 저장소의 <strong>Contents: Read and write</strong> 하나만 주면 돼요.</p>
<p class="muted small">토큰은 이 브라우저에만 저장되고, GitHub API 말고는 어디로도 전송되지 않아요.</p>
<form id="login" class="form panel">
<label>토큰<input type="password" name="token" autocomplete="off" required placeholder="github_pat_..."></label>
<button class="btn">로그인</button>
<p id="login-status" class="status"></p>
</form>
<p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">토큰 만들기 ↗</a></p>
</section>`;
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    setToken(e.target.token.value.trim());
    const status = document.getElementById('login-status');
    try {
      await gh(FILES[0].path);
      editorView(FILES[0]);
    } catch (err) {
      setToken('');
      status.className = 'status err';
      status.textContent = `로그인 실패: ${err.message}`;
    }
  });
}

async function editorView(file) {
  rootEl.innerHTML = `<section class="page-head"><h1>데이터 관리</h1>
<p class="muted">저장하면 GitHub에 커밋되고, 1~2분 뒤 사이트에 반영돼요. <a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}/actions" target="_blank" rel="noopener">배포 상태 보기 ↗</a></p></section>
<div class="admin-tabs" role="tablist">${FILES.map(
    (f) => `<button role="tab" data-path="${f.path}" aria-selected="${f.path === file.path}">${f.label}</button>`
  ).join('')}<button id="logout" type="button">로그아웃</button></div>
<div id="editor"><p class="muted">불러오는 중…</p></div>
<div class="admin-bar"><button id="save" class="btn">GitHub에 저장</button><span id="status" class="status"></span></div>`;
  rootEl.querySelectorAll('[data-path]').forEach((b) =>
    b.addEventListener('click', () => editorView(FILES.find((f) => f.path === b.dataset.path)))
  );
  document.getElementById('logout').addEventListener('click', () => {
    setToken('');
    loginView();
  });
  document.getElementById('save').addEventListener('click', save);

  try {
    const res = await gh(file.path);
    current = { file, data: JSON.parse(decode(res.content)), sha: res.sha };
    renderEditor();
  } catch (err) {
    status(`불러오기 실패: ${err.message}`, true);
  }
}

function status(msg, isErr = false) {
  const el = document.getElementById('status');
  el.className = `status ${isErr ? 'err' : 'ok'}`;
  el.textContent = msg;
}

const DROP_COLS = [
  ['monster', '몬스터'],
  ['item', '아이템'],
  ['rate', '드롭률(%)'],
  ['source', '출처 URL'],
  ['note', '비고']
];
const SCROLL_COLS = [
  ['id', 'ID'],
  ['name', '등급 이름'],
  ['success', '성공(%)'],
  ['destroyOnFail', '실패 시 파괴(%)']
];
const getPath = (obj, p) => p.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, p, v) => {
  const keys = p.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};

function tableEditor(rows, cols, numeric, blank) {
  const ed = document.getElementById('editor');
  ed.innerHTML = `<div class="table-wrap"><table class="data admin-table"><thead><tr>${cols
    .map(([, l]) => `<th>${l}</th>`)
    .join('')}<th></th></tr></thead><tbody>${rows
    .map(
      (r, i) =>
        `<tr>${cols
          .map(([k]) => `<td><input data-i="${i}" data-k="${k}" value="${esc(getPath(r, k))}"${numeric.includes(k) ? ' type="number" step="any"' : ''}></td>`)
          .join('')}<td><button class="icon-btn" data-del="${i}" title="삭제">✕</button></td></tr>`
    )
    .join('')}</tbody></table></div>
<p><button id="add-row" class="btn ghost" type="button">+ 행 추가</button></p>`;
  ed.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('input', () => {
      const v = numeric.includes(inp.dataset.k) ? parseFloat(inp.value) : inp.value;
      setPath(rows[+inp.dataset.i], inp.dataset.k, Number.isNaN(v) ? '' : v);
    })
  );
  ed.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      rows.splice(+b.dataset.del, 1);
      renderEditor();
    })
  );
  document.getElementById('add-row').addEventListener('click', () => {
    rows.push(blank());
    renderEditor();
  });
}

function renderEditor() {
  const { file, data } = current;
  if (file.editor === 'drops') {
    tableEditor(data.entries, DROP_COLS, ['rate'], () => ({ monster: '', item: '', rate: '', source: '', note: '' }));
  } else if (file.editor === 'scrolls') {
    tableEditor(data.tiers, SCROLL_COLS, ['success', 'destroyOnFail'], () => ({ id: '', name: '', success: 0, destroyOnFail: 0 }));
  } else {
    document.getElementById('editor').innerHTML = `<p class="muted small">구조가 복잡한 데이터라 JSON을 직접 편집해요. 저장 전에 형식을 검사해요.</p>
<textarea id="json" class="admin-json" spellcheck="false">${esc(JSON.stringify(data, null, 2))}</textarea>`;
  }
}

function validate(file, data) {
  if (file.editor === 'drops') {
    for (const [i, d] of data.entries.entries()) {
      if (!d.monster || !d.item) return `${i + 1}행: 몬스터와 아이템을 입력하세요.`;
      if (!(d.rate > 0 && d.rate <= 100)) return `${i + 1}행: 드롭률은 0보다 크고 100 이하여야 해요.`;
      if (d.source && !/^https?:\/\//.test(d.source)) return `${i + 1}행: 출처는 http(s) URL이어야 해요.`;
    }
  }
  if (file.editor === 'scrolls') {
    for (const [i, s] of data.tiers.entries()) {
      if (!s.id || !s.name) return `${i + 1}행: ID와 이름을 입력하세요.`;
      if (!(s.success >= 0 && s.success <= 100) || !(s.destroyOnFail >= 0 && s.destroyOnFail <= 100))
        return `${i + 1}행: 확률은 0~100 사이여야 해요.`;
    }
  }
  return null;
}

async function save() {
  const { file } = current;
  let data = current.data;
  if (file.editor === 'json') {
    try {
      data = JSON.parse(document.getElementById('json').value);
    } catch (err) {
      return status(`JSON 형식 오류: ${err.message}`, true);
    }
  }
  const problem = validate(file, data);
  if (problem) return status(problem, true);
  data.updated = today();

  const btn = document.getElementById('save');
  btn.disabled = true;
  status('저장 중…');
  try {
    const res = await gh(file.path, {
      method: 'PUT',
      body: JSON.stringify({
        message: `data: update ${file.path} via admin`,
        content: encode(`${JSON.stringify(data, null, 2)}\n`),
        sha: current.sha,
        branch: repo.branch
      })
    });
    current.sha = res.content.sha;
    current.data = data;
    status('저장했어요. 1~2분 뒤 사이트에 반영돼요.');
  } catch (err) {
    status(`저장 실패: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

getToken() ? editorView(FILES[0]) : loginView();
