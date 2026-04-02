// ══════════════════════════════════════════════════════
//  WikiMind — app.js
//  6가지 신기능: 폴더추가, 위키링크 자동생성, /단축어,
//               코드복사, 이미지/파일첨부, 다크/라이트모드
// ══════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
  sendPasswordResetEmail, sendEmailVerification, reload,
  GoogleAuthProvider, GithubAuthProvider }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ════════════════════════════════════════════
//  🔑 Firebase 설정값 — 여기에 입력하세요
// ════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyA2Werl-_ckw3wUzhrOGVhe6EM8aPbLdKk",
  authDomain: "wikimind-2026-46942.firebaseapp.com",
  projectId: "wikimind-2026-46942",
  storageBucket: "wikimind-2026-46942.firebasestorage.app",
  messagingSenderId: "778654190177",
  appId: "1:778654190177:web:f17ac8552a0f12c73db820"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
const state = {
  docs: [],
  folders: ['개인 메모', '프로젝트', '학습'],
  activeDocId: null,
  saveTimer: null,
  view: 'split',
  activeTag: null,
  currentUser: null,
  firestoreUnsub: null,
  theme: localStorage.getItem('wm-theme') || 'dark',
  slashVisible: false,
  slashStartPos: 0,
  slashIdx: 0,
  rightSidebarOpen: false,
  calY: new Date().getFullYear(),
  calM: new Date().getMonth(),
  selectedDate: (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
  nativeEvents: [],
  combinedEvents: [],
  calv4Unsub: null,
};

const SAMPLE_DOCS = [{
  id: 'sample-1', title: '📌 위키마인드 시작하기',
  folder: '개인 메모', tags: ['가이드'],
  content: `# 위키마인드에 오신 걸 환영합니다 🎉\n\n## ✨ 새로운 기능\n\n- **폴더 추가** — 사이드바 "문서" 옆 + 버튼으로 새 폴더 생성\n- **위키 링크 자동 생성** — \`[[없는 문서]]\` 클릭 시 해당 제목으로 문서 생성\n- **/ 단축어** — 에디터에서 \`/\` 를 입력하면 메뉴가 나타납니다\n- **코드 복사** — 코드 블록 우측 상단의 복사 버튼\n- **이미지/파일 첨부** — 툴바 🖼 버튼 또는 에디터에 드래그앤드롭\n- **다크/라이트 모드** — 헤더 우측 🌙/☀️ 버튼\n\n## 마크다운 예시\n\n\`\`\`javascript\nconsole.log("Hello, WikiMind!");\n// 우측 상단 복사 버튼을 눌러보세요\n\`\`\`\n\n> 인용문입니다.\n\n**굵게** *기울임* ~~취소선~~\n\n---\n\n[[새 문서]] ← 클릭하면 새 문서가 자동 생성됩니다!`,
  updatedAt: new Date().toISOString(),
}];

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
const $ = id => document.getElementById(id);
const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const formatDate = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
};

// ════════════════════════════════════════════
//  THEME  (기능 1: 다크/라이트 모드)
// ════════════════════════════════════════════
function applyTheme(t) {
  state.theme = t;
  localStorage.setItem('wm-theme', t);
  document.documentElement.setAttribute('data-theme', t);
  const btn = $('themeBtn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

window.toggleTheme = function() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
};

// 초기 테마 적용
applyTheme(state.theme);

// ════════════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  state.currentUser = user;
  $('loadingScreen').style.display = 'none';

  // Firebase 미설정 감지
  if (firebaseConfig.apiKey === '여기에_API_KEY_입력') {
    showPage('authPage');
    showAuthMsg('⚠️ Firebase 설정값을 입력해주세요. (wikimind.js 상단)', 'err');
    return;
  }

  if (user) {
    const isEmail = user.providerData.some(p => p.providerId === 'password');
    if (isEmail && !user.emailVerified) {
      stopSync(); showPage('verifyPage');
      $('verifyEmail').textContent = user.email;
      startVerifyPolling();
    } else {
      showPage('appPage');
      startSync(user.uid);
      renderUserMenu(user);
      applyTheme(state.theme);
    }
  } else {
    stopSync(); state.docs = [];
    showPage('authPage');
    renderAuthForm();
  }
});

function showPage(id) {
  ['loadingScreen','authPage','verifyPage','appPage'].forEach(p => {
    const el = $(p);
    if (el) el.style.display = p === id ? (p === 'appPage' ? 'flex' : 'flex') : 'none';
  });
}

// ════════════════════════════════════════════
//  AUTH UI
// ════════════════════════════════════════════
let authMode = 'login';

window.setAuthMode = function(m) { authMode = m; clearAuthMsg(); renderAuthForm(); };

function renderAuthForm() {
  const L = authMode === 'login', R = authMode === 'reset', Sg = authMode === 'signup';
  $('authNameWrap').style.display     = Sg ? 'block' : 'none';
  $('authSocial').style.display       = R  ? 'none'  : 'flex';
  $('authDivider').style.display      = R  ? 'none'  : 'flex';
  $('authPasswordWrap').style.display = R  ? 'none'  : 'block';
  const btn = $('authSubmitBtn');
  btn.textContent = L ? '로그인' : Sg ? '회원가입' : '재설정 링크 보내기';
  btn.onclick     = R ? handleReset : () => handleEmailAuth(Sg);
  $('authFooter').innerHTML = L
    ? `<span class="auth-link" onclick="setAuthMode('signup')">회원가입</span><span class="auth-link" onclick="setAuthMode('reset')">비밀번호 찾기</span>`
    : Sg ? `<span class="auth-link" onclick="setAuthMode('login')">이미 계정이 있으신가요? 로그인</span>`
    :      `<span class="auth-link" onclick="setAuthMode('login')">← 로그인으로 돌아가기</span>`;
}

async function handleEmailAuth(isSignup) {
  const email = $('authEmail').value.trim();
  const pass  = $('authPassword').value;
  const name  = $('authName')?.value.trim();
  if (!email || !pass) return;
  setAuthLoading(true); clearAuthMsg();
  try {
    if (isSignup) {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(user, { displayName: name });
      await sendEmailVerification(user);
      showPage('verifyPage');
      $('verifyEmail').textContent = user.email;
      startVerifyPolling();
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch(e) { showAuthMsg(fbErrMsg(e.code), 'err'); }
  setAuthLoading(false);
}

window.handleSocialLogin = async function(provider) {
  setAuthLoading(true); clearAuthMsg();
  try { await signInWithPopup(auth, provider); }
  catch(e) { if (e.code !== 'auth/popup-closed-by-user') showAuthMsg(fbErrMsg(e.code), 'err'); }
  setAuthLoading(false);
};

async function handleReset() {
  const email = $('authEmail').value.trim();
  if (!email) { showAuthMsg('이메일을 입력해주세요.', 'err'); return; }
  try { await sendPasswordResetEmail(auth, email); showAuthMsg('재설정 링크를 이메일로 보냈습니다.', 'ok'); }
  catch(e) { showAuthMsg(fbErrMsg(e.code), 'err'); }
}

window.handleSignOut = async function() { await signOut(auth); };

function setAuthLoading(on) {
  $('authSubmitBtn').disabled = on;
  $('authSubmitBtn').textContent = on ? '처리 중...' : (authMode === 'login' ? '로그인' : authMode === 'signup' ? '회원가입' : '재설정 링크 보내기');
}
function showAuthMsg(m, type) { const e=$('authError'); e.textContent=m; e.style.display='block'; e.className='auth-msg '+type; }
function clearAuthMsg() { $('authError').style.display='none'; }

function fbErrMsg(code) {
  return ({
    'auth/user-not-found':     '존재하지 않는 계정입니다.',
    'auth/wrong-password':     '비밀번호가 올바르지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/email-already-in-use':'이미 사용 중인 이메일입니다.',
    'auth/invalid-email':      '올바른 이메일 형식이 아닙니다.',
    'auth/weak-password':      '비밀번호는 6자 이상이어야 합니다.',
    'auth/account-exists-with-different-credential':'같은 이메일로 다른 방법으로 가입된 계정이 있습니다.',
  })[code] || '오류가 발생했습니다. 다시 시도해주세요.';
}

// ── Email Verify ──
let verifyPoller = null;
function startVerifyPolling() {
  clearInterval(verifyPoller);
  verifyPoller = setInterval(async () => {
    const u = auth.currentUser; if (!u) { clearInterval(verifyPoller); return; }
    await reload(u);
    if (u.emailVerified) {
      clearInterval(verifyPoller);
      showPage('appPage'); startSync(u.uid); renderUserMenu(u); applyTheme(state.theme);
    }
  }, 5000);
}

window.handleResendVerification = async function() {
  const u = auth.currentUser; if (!u) return;
  const btn = $('resendBtn'); btn.disabled = true; btn.textContent = '발송 중...';
  try {
    await sendEmailVerification(u);
    btn.textContent = '✓ 재발송 완료';
    setTimeout(() => { btn.disabled = false; btn.textContent = '인증 메일 재발송'; }, 30000);
  } catch {
    btn.textContent = '잠시 후 다시 시도하세요';
    setTimeout(() => { btn.disabled = false; btn.textContent = '인증 메일 재발송'; }, 5000);
  }
};

window.handleVerifySignOut = async function() { clearInterval(verifyPoller); await signOut(auth); };

// ── User Menu ──
function renderUserMenu(user) {
  const initials = (user.displayName || user.email || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const isEmail = user.providerData.some(p => p.providerId === 'password');
  const verified = !isEmail || user.emailVerified;
  const wrap = $('userMenuWrap');
  wrap.innerHTML = `
    <button class="theme-btn" id="themeBtn" onclick="toggleTheme()" title="테마 전환">${state.theme==='dark'?'☀️':'🌙'}</button>
    <div class="user-avatar" onclick="toggleUserDropdown()" title="${escHtml(user.email||'')}">
      ${user.photoURL
        ? `<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-size:11px;font-weight:700;color:var(--accent)">${initials}</span>`}
    </div>
    <div class="user-dropdown" id="userDropdown" style="display:none">
      <div style="padding:10px 12px 10px;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(user.displayName||'사용자')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(user.email||'')}</div>
        <div style="font-size:10px;margin-top:4px;color:${verified?'var(--green)':'var(--red)'}">${verified?'✓ 이메일 인증 완료':'⚠ 이메일 미인증'}</div>
      </div>
      <div style="padding:8px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--green)">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
          클라우드 동기화 중
        </div>
      </div>
      <div class="ud-item danger" onclick="handleSignOut()">로그아웃</div>
    </div>`;
}

window.toggleUserDropdown = function() {
  const d = $('userDropdown');
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
};
document.addEventListener('click', e => {
  const wrap = $('userMenuWrap');
  if (wrap && !wrap.contains(e.target)) { const d=$('userDropdown'); if(d) d.style.display='none'; }
});

// ════════════════════════════════════════════
//  FIRESTORE SYNC
// ════════════════════════════════════════════
function startSync(uid) {
  stopSync();
  const q = query(collection(db, 'users', uid, 'docs'), orderBy('updatedAt', 'desc'));
  state.firestoreUnsub = onSnapshot(q, snap => {
    if (snap.empty) {
      SAMPLE_DOCS.forEach(d => pushDoc(d));
      state.docs = [...SAMPLE_DOCS];
    } else {
      state.docs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title:     data.title     ?? '제목 없는 문서',
          content:   data.content   ?? '',
          folder:    data.folder    ?? '',
          tags:      data.tags      ?? [],
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        };
      });
    }
    renderAll();
    updateMiniCalendarData();
    if (!state.activeDocId && state.docs.length) openDoc(state.docs[0].id);
    updateStatus();
  });
  
  state.calv4Unsub = onSnapshot(doc(db, 'users', uid, 'events', 'calv4'), snap => {
    if(snap.exists()) {
      try { state.nativeEvents = JSON.parse(snap.data().data || '[]'); } catch(e){ state.nativeEvents=[]; }
    } else { state.nativeEvents = []; }
    updateMiniCalendarData();
  });
}

function stopSync() {
  if (state.firestoreUnsub) { state.firestoreUnsub(); state.firestoreUnsub = null; }
  if (state.calv4Unsub) { state.calv4Unsub(); state.calv4Unsub = null; }
}

async function pushDoc(docData) {
  if (!state.currentUser) return;
  await setDoc(doc(db, 'users', state.currentUser.uid, 'docs', String(docData.id)), {
    title:     docData.title,
    content:   docData.content,
    folder:    docData.folder,
    tags:      docData.tags,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function removeDoc(docId) {
  if (!state.currentUser) return;
  await deleteDoc(doc(db, 'users', state.currentUser.uid, 'docs', String(docId)));
}

function schedulePush(docData) {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => { pushDoc(docData); showToast('☁ 저장됨'); }, 1500);
}

// ════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════
function renderAll() { renderTree(); renderTags(); updateStatus(); updateFolderSelect(); }

function renderTree() {
  const tree = $('docTree');
  const docs = state.activeTag ? state.docs.filter(d => d.tags.includes(state.activeTag)) : state.docs;
  const grouped = {}, noFolder = [];
  docs.forEach(d => {
    if (d.folder) { if (!grouped[d.folder]) grouped[d.folder]=[]; grouped[d.folder].push(d); }
    else noFolder.push(d);
  });

  let html = '';
  // Render known folders (maintains order)
  state.folders.forEach(folder => {
    const fdocs = grouped[folder] || [];
    html += `<div class="folder-item">
      <div class="folder-header" onclick="toggleFolder(this)">
        <span class="folder-arrow open">▶</span>
        <span>📁</span>
        <span style="flex:1;margin-left:4px">${escHtml(folder)}</span>
        <span style="font-size:10px;color:var(--text3)">${fdocs.length}</span>
        <button class="folder-delete" onclick="deleteFolderByName(event,'${escHtml(folder)}')" title="폴더 삭제">✕</button>
      </div>
      <div class="folder-children">
        ${fdocs.map(d => docItemHTML(d)).join('') || ''}
      </div>
    </div>`;
    delete grouped[folder];
  });
  // Unknown folders (from DB but not in state.folders)
  Object.entries(grouped).forEach(([folder, fdocs]) => {
    html += `<div class="folder-item">
      <div class="folder-header" onclick="toggleFolder(this)">
        <span class="folder-arrow open">▶</span><span>📁</span>
        <span style="flex:1;margin-left:4px">${escHtml(folder)}</span>
        <span style="font-size:10px;color:var(--text3)">${fdocs.length}</span>
      </div>
      <div class="folder-children">${fdocs.map(d => docItemHTML(d)).join('')}</div>
    </div>`;
  });
  noFolder.forEach(d => { html += docItemHTML(d); });
  tree.innerHTML = html || '<div style="padding:12px;font-size:12px;color:var(--text3);text-align:center">문서 없음</div>';
}

function docItemHTML(d) {
  const active = d.id == state.activeDocId ? 'active' : '';
  return `<div class="doc-item ${active}" onclick="openDoc('${d.id}')">
    <span class="doc-icon">📄</span>
    <span class="doc-name">${escHtml(d.title)}</span>
    <button class="doc-delete" onclick="deleteDocById(event,'${d.id}')">✕</button>
  </div>`;
}

function renderTags() {
  const all = [...new Set(state.docs.flatMap(d => d.tags))];
  $('tagList').innerHTML = all.map(t =>
    `<span class="tag-chip ${state.activeTag===t?'active':''}" onclick="filterByTag('${escHtml(t)}')">${escHtml(t)}</span>`
  ).join('');
}

function renderDocTags(d) {
  const wrap = $('tagInputWrap');
  wrap.innerHTML = d.tags.map(t =>
    `<span class="tag-badge">${escHtml(t)}<button onclick="removeTag('${escHtml(t)}')">×</button></span>`
  ).join('') + `<input type="text" class="tag-add-input" id="tagAddInput" placeholder="태그 추가..." maxlength="20" onkeydown="addTagOnEnter(event)">`;
}

function updateFolderSelect() {
  const sel = $('newDocFolder');
  if (!sel) return;
  sel.innerHTML = '<option value="">폴더 없음</option>' +
    state.folders.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join('');
}

function updateStatus() {
  const d = state.docs.find(x => x.id == state.activeDocId);
  const content = d?.content || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  $('wordCount').textContent  = `${words} 단어`;
  $('charCount').textContent  = `${content.length} 자`;
  $('docCount').textContent   = `${state.docs.length} 문서`;
}

// ════════════════════════════════════════════
//  FOLDER  (기능 1: 폴더 추가)
// ════════════════════════════════════════════
window.openNewFolderModal = function() {
  $('newFolderName').value = '';
  $('newFolderModal').classList.add('visible');
  setTimeout(() => $('newFolderName').focus(), 80);
};

window.createFolder = function() {
  const name = $('newFolderName').value.trim();
  if (!name) return;
  if (!state.folders.includes(name)) {
    state.folders.push(name);
    localStorage.setItem('wm-folders', JSON.stringify(state.folders));
  }
  closeModal('newFolderModal');
  renderAll();
};

window.deleteFolderByName = function(e, name) {
  e.stopPropagation();
  if (!confirm(`"${name}" 폴더를 삭제할까요?\n(폴더 안 문서는 폴더 없음으로 이동됩니다)`)) return;
  state.folders = state.folders.filter(f => f !== name);
  localStorage.setItem('wm-folders', JSON.stringify(state.folders));
  state.docs.forEach(d => {
    if (d.folder === name) { d.folder = ''; pushDoc(d); }
  });
  renderAll();
};

// 폴더 목록 로컬스토리지에서 복원
(function() {
  const saved = localStorage.getItem('wm-folders');
  if (saved) try { state.folders = JSON.parse(saved); } catch {}
})();

// ════════════════════════════════════════════
//  OPEN / CREATE / DELETE
// ════════════════════════════════════════════
window.openDoc = function(id) {
  const d = state.docs.find(x => x.id == id);
  if (!d) return;
  state.activeDocId = id;
  $('emptyState').style.display = 'none';
  const wrap = $('editorWrapper');
  wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden';
  $('docTitle').value = d.title;
  $('editor').value   = d.content;
  $('docDate').textContent = formatDate(d.updatedAt);
  renderDocTags(d);
  renderPreview();
  renderTree();
  updateStatus();
  
  if (window.innerWidth <= 768) {
    const leftAside = document.querySelector('aside:not(.right-sidebar)');
    if (leftAside) leftAside.classList.remove('open');
  }
};

window.openNewDocModal = function() {
  $('newDocName').value = '';
  $('newDocModal').classList.add('visible');
  setTimeout(() => $('newDocName').focus(), 80);
};

window.createDoc = function() {
  const name   = $('newDocName').value.trim() || '제목 없는 문서';
  const folder = $('newDocFolder').value;
  createDocWithTitle(name, folder);
  closeModal('newDocModal');
};

function createDocWithTitle(title, folder = '') {
  const newDoc = {
    id: Date.now().toString(), title, folder, tags: [],
    content: `# ${title}\n\n`,
    updatedAt: new Date().toISOString(),
  };
  state.docs.unshift(newDoc);
  pushDoc(newDoc);
  renderAll();
  openDoc(newDoc.id);
  return newDoc;
}

window.deleteDocById = function(e, id) {
  e.stopPropagation();
  if (!confirm('이 문서를 삭제할까요?')) return;
  removeDoc(id);
  state.docs = state.docs.filter(d => d.id != id);
  if (state.activeDocId == id) {
    state.activeDocId = null;
    $('emptyState').style.display = 'flex';
    $('editorWrapper').style.display = 'none';
  }
  renderAll();
};

window.closeModal = function(id) { $(id).classList.remove('visible'); };

// ════════════════════════════════════════════
//  EDITOR EVENTS
// ════════════════════════════════════════════
$('editor').addEventListener('input', () => {
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d) return;
  d.content   = $('editor').value;
  d.updatedAt = new Date().toISOString();
  renderPreview();
  updateStatus();
  schedulePush(d);
  handleSlashInput();
});

$('docTitle').addEventListener('input', () => {
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d) return;
  d.title = $('docTitle').value;
  renderTree();
  schedulePush(d);
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const d = state.docs.find(x => x.id == state.activeDocId);
    if (d) { pushDoc(d); showToast('☁ 저장됨'); }
  }
  // Slash menu keyboard nav
  if (state.slashVisible) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSlash(1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveSlash(-1); }
    if (e.key === 'Enter')     { e.preventDefault(); selectSlash(); }
    if (e.key === 'Escape')    { hideSlashMenu(); }
  }
});

function showToast(msg = '✓ 저장됨') {
  const t = $('savedToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ════════════════════════════════════════════
//  TAGS
// ════════════════════════════════════════════
window.addTagOnEnter = function(e) {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val) return;
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d || d.tags.includes(val)) { e.target.value = ''; return; }
  d.tags.push(val); pushDoc(d); renderDocTags(d); renderTags();
  e.target.value = '';
};

window.removeTag = function(tag) {
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d) return;
  d.tags = d.tags.filter(t => t !== tag);
  pushDoc(d); renderDocTags(d); renderTags();
};

window.filterByTag = function(tag) {
  state.activeTag = state.activeTag === tag ? null : tag;
  renderTree(); renderTags();
};

// ════════════════════════════════════════════
//  MARKDOWN PREVIEW
// ════════════════════════════════════════════
function renderPreview() {
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d) return;
  $('preview').innerHTML = parseMarkdown(d.content);
  // Attach copy buttons to code blocks
  $('preview').querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn'; btn.textContent = '복사';
    btn.onclick = () => {
      navigator.clipboard.writeText(code.innerText).then(() => {
        btn.textContent = '✓ 복사됨'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 2000);
      });
    };
    pre.appendChild(btn);
  });
}

function parseMarkdown(md) {
  // Code blocks first (기능 4: 복사 버튼은 renderPreview에서 동적으로 추가)
  const codeBlocks = [];
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${escHtml(code.trimEnd())}</code></pre>`);
    return `%%CODE_${idx}%%`;
  });

  // Images/files (기능 5)
  md = md.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, m => {
    const match = m.match(/!\[([^\]]*)\]\((data:[^)]+)\)/);
    if (!match) return m;
    return `<img src="${match[2]}" alt="${escHtml(match[1])}" style="max-width:100%;border-radius:6px;margin:8px 0;border:1px solid var(--border)">`;
  });
  md = md.replace(/\[📎 ([^\]]+)\]\(([^)]+)\)/g, (_, name, href) =>
    `<div class="file-embed">📎 <a href="${href}" target="_blank" rel="noopener">${escHtml(name)}</a></div>`
  );

  md = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---$/gm,      '<hr>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/~~(.+?)~~/g,    '<del>$1</del>')
    .replace(/`(.+?)`/g,      '<code>$1</code>')
    // 기능 2: 위키 링크 — jumpToDoc가 없으면 createAndJump
    .replace(/\[\[(.+?)\]\]/g, (_, t) =>
      `<a class="wiki-link" onclick="jumpOrCreateDoc('${escHtml(t)}')" href="#">[[${t}]]</a>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^- \[x\] (.+)$/gm, '<li style="list-style:none">✅ <del>$1</del></li>')
    .replace(/^- \[ \] (.+)$/gm, '<li style="list-style:none">☐ $1</li>')
    .replace(/^- (.+)$/gm,   '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    .replace(/^📅\[([a-zA-Z0-9]+)\]\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?(?:\s+~(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(\d{2}:\d{2}))?)?\s+([^\n]+)/gm, (_, id, sd, st, ed, et, title) => {
      let timeStr = "";
      if (st) timeStr += st;
      if (ed || et) timeStr += " ~ " + (ed ? ed + " " : "") + (et || "");
      return `<div class="doc-schedule">📅 <strong>${sd}</strong> ${timeStr ? `<span style="opacity:0.8">${timeStr}</span>` : ''} <span style="margin-left:8px;font-weight:500;color:var(--text)">${title}</span></div>`;
    })
    .replace(/\n\n([^<\n].+?)(?=\n\n|$)/gs, (_, p) => `<p>${p}</p>`)
    .replace(/\n/g,'<br>');

  // Restore code blocks (unescape for them)
  codeBlocks.forEach((block, i) => {
    md = md.replace(`%%CODE_${i}%%`, block);
  });

  return md;
}

// 기능 2: 위키 링크 — 문서 없으면 자동 생성
window.jumpOrCreateDoc = function(title) {
  const d = state.docs.find(x => x.title === title);
  if (d) { openDoc(d.id); }
  else {
    if (confirm(`"${title}" 문서가 없습니다.\n새로 만들까요?`)) {
      createDocWithTitle(title);
    }
  }
};

// ════════════════════════════════════════════
//  / 단축어 메뉴  (기능 3)
// ════════════════════════════════════════════
const SLASH_COMMANDS = [
  { icon:'📄', label:'새 페이지',   desc:'새 문서 만들기',          action: () => openNewDocModal() },
  { icon:'📋', label:'표',          desc:'마크다운 표 삽입',        action: () => insertAtCursor('\n| 열1 | 열2 | 열3 |\n|------|------|------|\n| 내용 | 내용 | 내용 |\n') },
  { icon:'💻', label:'코드 블록',   desc:'코드 블록 삽입',          action: () => insertAtCursor('\n```javascript\n\n```\n') },
  { icon:'📌', label:'제목 1',      desc:'# 큰 제목',               action: () => insertLine('# ') },
  { icon:'📍', label:'제목 2',      desc:'## 중간 제목',            action: () => insertLine('## ') },
  { icon:'🔹', label:'제목 3',      desc:'### 작은 제목',           action: () => insertLine('### ') },
  { icon:'•',  label:'목록',        desc:'- 불릿 리스트',           action: () => insertLine('- ') },
  { icon:'1.', label:'번호 목록',   desc:'1. 번호 리스트',          action: () => insertLine('1. ') },
  { icon:'☐',  label:'체크박스',    desc:'- [ ] 할 일 리스트',      action: () => insertLine('- [ ] ') },
  { icon:'❝',  label:'인용',        desc:'인용문 블록',             action: () => insertLine('> ') },
  { icon:'—',  label:'구분선',      desc:'수평선 삽입',             action: () => insertAtCursor('\n---\n') },
  { icon:'🔗', label:'위키 링크',   desc:'[[문서 이름]] 링크',      action: () => insertWikiLink() },
  { icon:'🖼', label:'이미지',      desc:'이미지 파일 삽입',        action: () => triggerFileUpload('image') },
  { icon:'📎', label:'파일 첨부',   desc:'파일 첨부',               action: () => triggerFileUpload('file') },
  { icon:'📅', label:'일정 추가',   desc:'캘린더 연동 일정',        action: () => insertScheduleLine() },
];

function handleSlashInput() {
  const ta = $('editor');
  const val = ta.value;
  const pos = ta.selectionStart;
  // Find last '/' before cursor on the same line
  const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
  const lineText  = val.slice(lineStart, pos);
  const slashIdx  = lineText.lastIndexOf('/');
  if (slashIdx === -1) { hideSlashMenu(); return; }
  const query = lineText.slice(slashIdx + 1).toLowerCase();
  // Only show if slash is the first char or preceded by space
  const charBefore = slashIdx > 0 ? lineText[slashIdx - 1] : '';
  if (charBefore && charBefore !== ' ') { hideSlashMenu(); return; }

  const filtered = SLASH_COMMANDS.filter(c =>
    query === '' || c.label.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query)
  );
  if (!filtered.length) { hideSlashMenu(); return; }

  state.slashVisible  = true;
  state.slashStartPos = lineStart + slashIdx;
  state.slashIdx      = 0;
  renderSlashMenu(filtered, ta);
}

function renderSlashMenu(items, ta) {
  const menu = $('slashMenu');
  menu.innerHTML = items.map((c, i) =>
    `<div class="slash-item ${i===state.slashIdx?'selected':''}" onclick="selectSlashItem(${SLASH_COMMANDS.indexOf(c)})">
      <span class="slash-item-icon">${c.icon}</span>
      <div><div class="slash-item-label">${c.label}</div><div class="slash-item-desc">${c.desc}</div></div>
    </div>`
  ).join('');
  // Position menu near cursor
  const rect = ta.getBoundingClientRect();
  menu.style.display = 'block';
  menu.style.left    = (rect.left + 28) + 'px';
  menu.style.top     = (rect.top + 80) + 'px';
  menu.style.display = 'block';
  menu.classList.add('visible');
  // Store filtered for keyboard use
  menu._filtered = items;
}

function hideSlashMenu() {
  state.slashVisible = false;
  const m = $('slashMenu');
  m.classList.remove('visible');
  m.style.display = 'none';
}

function moveSlash(dir) {
  const m = $('slashMenu');
  const items = m.querySelectorAll('.slash-item');
  state.slashIdx = Math.max(0, Math.min(items.length - 1, state.slashIdx + dir));
  items.forEach((el, i) => el.classList.toggle('selected', i === state.slashIdx));
}

function selectSlash() {
  const m = $('slashMenu');
  const filtered = m._filtered;
  if (!filtered || !filtered[state.slashIdx]) return;
  executeSlash(filtered[state.slashIdx]);
}

window.selectSlashItem = function(idx) { executeSlash(SLASH_COMMANDS[idx]); };

function executeSlash(cmd) {
  // Remove the /query text from editor
  const ta  = $('editor');
  const pos = ta.selectionStart;
  ta.value  = ta.value.slice(0, state.slashStartPos) + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = state.slashStartPos;
  hideSlashMenu();
  ta.dispatchEvent(new Event('input'));
  cmd.action();
}

// ════════════════════════════════════════════
//  이미지 / 파일 첨부  (기능 5)
// ════════════════════════════════════════════
window.triggerFileUpload = function(type) {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = type === 'image' ? 'image/*' : '*/*';
  input.onchange = e => handleFileInsert(e.target.files[0]);
  input.click();
};

function handleFileInsert(file) {
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  if (isImage) {
    const reader = new FileReader();
    reader.onload = e => {
      insertAtCursor(`\n![${file.name}](${e.target.result})\n`);
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      insertAtCursor(`\n[📎 ${file.name}](${dataUrl})\n`);
    };
    reader.readAsDataURL(file);
  }
}

// Drag & Drop onto editor pane
const editorPane = document.querySelector('.editor-pane');
const dropOverlay = document.querySelector('.drop-overlay');
if (editorPane) {
  editorPane.addEventListener('dragover', e => { e.preventDefault(); dropOverlay.classList.add('active'); });
  editorPane.addEventListener('dragleave', () => dropOverlay.classList.remove('active'));
  editorPane.addEventListener('drop', e => {
    e.preventDefault(); dropOverlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file) handleFileInsert(file);
  });
}

// ════════════════════════════════════════════
//  TOOLBAR HELPERS
// ════════════════════════════════════════════
function insertAtCursor(text) {
  const ta  = $('editor');
  const s   = ta.selectionStart;
  ta.value  = ta.value.slice(0, s) + text + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

window.insertMd = function(before, after) {
  const ta = $('editor');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || '텍스트';
  ta.setRangeText(before + sel + after, s, e, 'select');
  ta.dispatchEvent(new Event('input'));
  ta.focus();
};

function insertLine(prefix) {
  const ta  = $('editor');
  const s   = ta.selectionStart;
  const ls  = ta.value.lastIndexOf('\n', s - 1) + 1;
  ta.setRangeText(prefix, ls, ls, 'end');
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}
window.insertLine = insertLine;

window.insertScheduleLine = function() {
  const id = Math.random().toString(36).substr(2, 8);
  const d = new Date();
  const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  insertLine(`📅[${id}] ${dStr} 새로운 일정`);
};

window.insertWikiLink = function() {
  const title = prompt('연결할 문서 제목:');
  if (!title) return;
  insertAtCursor(`[[${title}]]`);
};

window.insertImageFromToolbar = function() { triggerFileUpload('image'); };
window.insertFileFromToolbar  = function() { triggerFileUpload('file'); };

// ════════════════════════════════════════════
//  VIEW / FOLDER TOGGLE / SEARCH / EXPORT
// ════════════════════════════════════════════
window.setView = function(mode) {
  state.view = mode;
  document.body.className = `view-${mode}`;
  ['edit','split','preview'].forEach(m =>
    $(`vBtn-${m}`).classList.toggle('active', m === mode));
};

window.toggleFolder = function(el) {
  const arrow    = el.querySelector('.folder-arrow');
  const children = el.nextElementSibling;
  const isOpen   = arrow.classList.contains('open');
  arrow.classList.toggle('open', !isOpen);
  children.style.display = isOpen ? 'none' : '';
};

const searchInput   = $('searchInput');
const searchResults = $('searchResults');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults.classList.remove('visible'); return; }
  const res = state.docs.filter(d =>
    d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
  ).slice(0, 6);
  searchResults.innerHTML = res.length
    ? res.map(d => {
        const idx  = d.content.toLowerCase().indexOf(q);
        const prev = idx >= 0
          ? '...' + d.content.slice(Math.max(0, idx-20), idx+50).replace(/[#*`]/g,'') + '...'
          : d.content.slice(0, 60).replace(/[#*`]/g,'');
        return `<div class="search-result-item" onclick="openDoc('${d.id}');searchInput.value='';searchResults.classList.remove('visible')">
          <div class="sr-title">${escHtml(d.title)}</div>
          <div class="sr-preview">${escHtml(prev)}</div>
        </div>`;
      }).join('')
    : '<div class="search-result-item"><div class="sr-title" style="color:var(--text3)">결과 없음</div></div>';
  searchResults.classList.add('visible');
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.remove('visible');
  if (!e.target.closest('.slash-menu') && !e.target.closest('#editor')) hideSlashMenu();
});

window.exportDoc = function() {
  const d = state.docs.find(x => x.id == state.activeDocId);
  if (!d) { alert('내보낼 문서를 선택해주세요.'); return; }
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([d.content], { type:'text/markdown' }));
  a.download = `${d.title}.md`;
  a.click();
};

// Modal overlay close
document.querySelectorAll('.modal-overlay').forEach(el =>
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('visible'); })
);

// Expose providers for social login buttons
window.googleProvider = googleProvider;
window.githubProvider = githubProvider;


// ════════════════════════════════════════════
//  MOBILE SIDEBAR
// ════════════════════════════════════════════
window.toggleLeftSidebar = function() {
  const leftAside = document.querySelector('aside:not(.right-sidebar)');
  if(leftAside) leftAside.classList.toggle('open');
};


// ════════════════════════════════════════════
//  MINI CALENDAR (우측 사이드바)
// ════════════════════════════════════════════
window.toggleRightSidebar = function() {
  state.rightSidebarOpen = !state.rightSidebarOpen;
  const sb = $('rightSidebar');
  if (!sb) return;
  if(state.rightSidebarOpen) {
    sb.classList.add('open');
    sb.classList.remove('collapsed');
    renderMiniCalendar();
  } else {
    sb.classList.remove('open');
    sb.classList.add('collapsed');
  }
};

window.navMiniCal = function(dir) {
  state.calM += dir;
  if(state.calM < 0) { state.calM = 11; state.calY--; }
  else if(state.calM > 11) { state.calM = 0; state.calY++; }
  renderMiniCalendar();
};

window.selectMiniCalDate = function(dStr) {
  state.selectedDate = dStr;
  renderMiniCalendar();
};

window.updateMiniCalendarData = function() {
  const docEvents = [];
  const regex = /^📅\[([a-zA-Z0-9]+)\]\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?(?:\s+~(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(\d{2}:\d{2}))?)?\s+([^\n]+)/gm;
  state.docs.forEach(d => {
    let match;
    while((match = regex.exec(d.content)) !== null) {
      docEvents.push({
        id: match[1],
        sd: match[2],
        st: match[3] || '',
        ed: match[4] || '',
        et: match[5] || '',
        title: match[6].trim(),
        isDocEvent: true,
        docId: d.id
      });
    }
  });
  state.combinedEvents = [...state.nativeEvents, ...docEvents];
  if (state.rightSidebarOpen && $('rightSidebar')) {
    renderMiniCalendar();
  }
}

window.renderMiniCalendar = function() {
  const titleEl = $('mcTitle');
  const daysEl = $('mcDays');
  if (!titleEl || !daysEl) return;
  
  titleEl.textContent = `${state.calY}년 ${state.calM + 1}월`;
  const firstDay = new Date(state.calY, state.calM, 1).getDay();
  const daysInMonth = new Date(state.calY, state.calM + 1, 0).getDate();
  const todayStr = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  
  let html = '';
  // prev month days
  const prevDays = new Date(state.calY, state.calM, 0).getDate();
  for(let i = firstDay - 1; i >= 0; i--) {
     html += `<div class="mc-day dimmed">${prevDays - i}</div>`;
  }
  
  for(let i = 1; i <= daysInMonth; i++) {
    const dStr = `${state.calY}-${String(state.calM+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    const dow = new Date(state.calY, state.calM, i).getDay();
    const isToday = dStr === todayStr ? 'today' : '';
    const isSelected = dStr === state.selectedDate ? 'selected' : '';
    let cls = `mc-day ${isToday} ${isSelected}`;
    if (dow === 0) cls += ' sun';
    else if (dow === 6) cls += ' sat';
    
    // find events for this day
    const evs = state.combinedEvents.filter(ev => ev.sd === dStr);
    let dotsHtml = evs.length > 0 ? `<div class="mc-dots">` + evs.slice(0,3).map(ev => `<div class="mc-dot ${!ev.isDocEvent ? 'native' : ''}"></div>`).join('') + `</div>` : '';
    
    html += `<div class="${cls}" onclick="selectMiniCalDate('${dStr}')">${i}${dotsHtml}</div>`;
  }
  
  // fill remaining
  const remain = (firstDay + daysInMonth) % 7;
  if(remain > 0) {
    for(let i=1; i<=7-remain; i++){
      html += `<div class="mc-day dimmed">${i}</div>`;
    }
  }
  
  daysEl.innerHTML = html;
  renderMiniEvents();
}

window.renderMiniEvents = function() {
  const tEl = $('mcEventsTitle');
  const lEl = $('mcEventsList');
  if(!tEl || !lEl) return;
  
  tEl.textContent = `${state.selectedDate} 일정`;
  const evs = state.combinedEvents.filter(ev => ev.sd === state.selectedDate);
  if(evs.length === 0) {
    lEl.innerHTML = `<div style="padding:10px 0;font-size:12px;color:var(--text3);text-align:center;">일정이 없습니다.</div>`;
    return;
  }
  
  lEl.innerHTML = evs.map(ev => {
    let timeStr = "";
    if (ev.st) timeStr += ev.st;
    if (ev.ed || ev.et) timeStr += " ~ " + (ev.ed && ev.ed !== ev.sd ? ev.ed + " " : "") + ev.et;
    return `
      <div class="mc-event-item ${!ev.isDocEvent ? 'native' : ''}">
        ${timeStr ? `<div class="mc-event-time">${timeStr}</div>` : ''}
        <div class="mc-event-lbl">${escHtml(ev.title)}</div>
      </div>
    `;
  }).join('');
}
