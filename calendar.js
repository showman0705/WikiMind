    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
    import {
      getAuth, onAuthStateChanged, signInWithEmailAndPassword,
      createUserWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
      sendPasswordResetEmail, sendEmailVerification, reload,
      GoogleAuthProvider, GithubAuthProvider
    }
      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
    import {
      getFirestore, collection, doc, setDoc, deleteDoc,
      onSnapshot, query, orderBy, serverTimestamp, getDoc
    }
      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

    const firebaseConfig = {
      apiKey: "AIzaSyA2Werl-_ckw3wUzhrOGVhe6EM8aPbLdKk",
      authDomain: "wikimind-2026-46942.firebaseapp.com",
      projectId: "wikimind-2026-46942",
      storageBucket: "wikimind-2026-46942.firebasestorage.app",
      messagingSenderId: "778654190177",
      appId: "1:778654190177:web:f17ac8552a0f12c73db820"
    };

    const fbApp = initializeApp(firebaseConfig);
    const auth = getAuth(fbApp);
    const db = getFirestore(fbApp);
    window.googleProvider = new GoogleAuthProvider();
    window.githubProvider = new GithubAuthProvider();
    window.googleProvider.setCustomParameters({ prompt: 'select_account' });

    const $ = id => document.getElementById(id);

    /* ══════════════════════════ CONSTANTS ══════════════════════════ */
    const MO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const DW = ['일', '월', '화', '수', '목', '금', '토'];
    const NOW = new Date();
    const HH = 64; // px per hour in day view
    const MAXLANES = 3;
    const COLMAP = { gold: 'var(--ac)', blue: 'var(--sat)', red: 'var(--sun)', green: 'var(--grn)', purple: 'var(--pur)' };

    /* ══════════════════════════ STATE ══════════════════════════ */
    const S = {
      view: 'month',
      y: NOW.getFullYear(), m: NOW.getMonth(), d: NOW.getDate(),
      events: [],
      drag: { on: false, anch: null, cur: null },
      form: { mode: null, editId: null, allDay: true, dates: [], color: 'gold' },
      detId: null,
      sliding: false,
      currentUser: null,
      docs: [],
      nativeEvents: []
    };

    /* ══════════════════════════ STORAGE ══════════════════════════ */

    function load() { }
    function save() {
      if (!S.currentUser) return;
      setDoc(doc(db, 'users', S.currentUser.uid, 'events', 'calv4'), { data: JSON.stringify(S.events.filter(e => !e.isDocEvent)) });
    }



    /* ══════════════════════════ DATE UTILS ══════════════════════════ */
    function ds(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
    function pd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
    function td() { return ds(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()) }
    function fmtShort(s) { const d = pd(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DW[d.getDay()]})` }
    function fmtRange(a, b) { return a === b ? fmtShort(a) : `${fmtShort(a)} ~ ${fmtShort(b)}` }
    function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h < 12 ? '오전' : '오후'; const hh = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${ap} ${hh}:${String(m).padStart(2, '0')}` }
    function rangeDates(a, b) { const sa = pd(a), sb = pd(b); const [f, t] = sa <= sb ? [sa, sb] : [sb, sa]; const r = []; for (let x = new Date(f); x <= t; x.setDate(x.getDate() + 1))r.push(ds(x.getFullYear(), x.getMonth(), x.getDate())); return r }

    /* ══════════════════════════ EVENT BARS ══════════════════════════ */
    function barsForWeek(week, wdates) {
      const ws = wdates[0], we = wdates[6];
      const evs = S.events.filter(ev => ev.allDay && ev.end >= ws && ev.start <= we);
      evs.sort((a, b) => a.start !== b.start ? (a.start < b.start ? -1 : 1) : (b.end >= a.end ? 1 : -1));
      const lanes = [];
      return evs.map(ev => {
        const bs = ev.start < ws ? ws : ev.start;
        const be = ev.end > we ? we : ev.end;
        const col = wdates.indexOf(bs);
        const ec = wdates.indexOf(be);
        if (col < 0 || ec < 0) return null;
        const span = ec - col + 1;
        const cL = ev.start < ws, cR = ev.end > we;
        let lane = 0;
        while (true) { if (!lanes[lane]) lanes[lane] = []; const c = lanes[lane].some(b => col < b.c + b.s && col + span > b.c); if (!c) { lanes[lane].push({ c: col, s: span }); break } lane++ }
        return { ev, col, span, lane, cL, cR };
      }).filter(Boolean);
    }

    /* ══════════════════════════ BUILD MONTH TRACK ══════════════════════════ */
    function buildTrack(y, m) {
      const fd = new Date(y, m, 1).getDay();
      const dim = new Date(y, m + 1, 0).getDate();
      const dpm = new Date(y, m, 0).getDate();
      const today = td();
      let cells = [];
      for (let i = fd - 1; i >= 0; i--)cells.push({ d: dpm - i, y, m: m - 1, o: true });
      for (let d = 1; d <= dim; d++)cells.push({ d, y, m, o: false });
      while (cells.length < 42) cells.push({ d: cells.length - fd - dim + 1, y, m: m + 1, o: true });
      const weeks = []; for (let i = 0; i < 42; i += 7)weeks.push(cells.slice(i, i + 7));
      let html = '';
      weeks.forEach(week => {
        const wdates = week.map(c => ds(c.y, c.m, c.d));
        const bars = barsForWeek(week, wdates);
        html += `<div class="wrow"><div class="crow">`;
        week.forEach((c, idx) => {
          const dstr = ds(c.y, c.m, c.d);
          const dow = idx, isT = !c.o && dstr === today;
          let cls = 'dc';
          if (c.o) cls += ' dm';
          if (dow === 0) cls += ' sun';
          if (dow === 6) cls += ' sat';
          if (isT) cls += ' today';
          // timed events
          const tevs = c.o ? [] : S.events.filter(ev => !ev.allDay && ev.start === dstr);
          let tchips = '';
          if (tevs.length) {
            tchips = '<div class="tcevs">';
            tevs.slice(0, 2).forEach(ev => { tchips += `<div class="tcchip" data-eid="${ev.id}"><div class="tcdot" style="background:${COLMAP[ev.color] || COLMAP.gold}"></div><span style="color:${COLMAP[ev.color] || COLMAP.gold}">${fmtTime(ev.startTime)} ${ev.title}</span></div>` });
            if (tevs.length > 2) tchips += `<div class="tcchip">+${tevs.length - 2}개</div>`;
            tchips += '</div>';
          }
          html += `<div class="${cls}" data-date="${dstr}"><div class="dnum">${c.d}</div>${tchips}</div>`;
        });
        html += `</div><div class="evlayer">`;
        const moreCnt = {};
        bars.forEach(b => {
          if (b.lane >= MAXLANES) { for (let i = b.col; i < b.col + b.span; i++)moreCnt[i] = (moreCnt[i] || 0) + 1; return }
          const L = (b.col / 7 * 100).toFixed(2);
          const W = ((b.span / 7 * 100) - .4).toFixed(2);
          const T = b.lane * 22;
          let cc = ''; if (b.cL && b.cR) cc = 'contLR'; else if (b.cL) cc = 'contL'; else if (b.cR) cc = 'contR';
          html += `<div class="evbar ${b.ev.color} ${cc}" data-eid="${b.ev.id}" style="left:${L}%;width:${W}%;top:${T}px">${b.cL ? '' : b.ev.title}</div>`;
        });
        Object.entries(moreCnt).forEach(([c, n]) => {
          const L = (parseInt(c) / 7 * 100).toFixed(2);
          const W = (100 / 7).toFixed(2);
          html += `<div class="moreind" style="left:${L}%;width:${W}%;top:${MAXLANES * 22}px">+${n}개 더</div>`;
        });
        html += `</div></div>`;
      });
      return html;
    }

    /* ══════════════════════════ RENDER MONTH ══════════════════════════ */
    function renderMonth(dir) {
      const vw = document.getElementById('vwrap');
      const html = buildTrack(S.y, S.m);
      if (!dir || S.sliding) {
        vw.innerHTML = `<div class="mv">
      <div class="dow-row">
        <div class="dow-cell sun">일</div><div class="dow-cell">월</div>
        <div class="dow-cell">화</div><div class="dow-cell">수</div>
        <div class="dow-cell">목</div><div class="dow-cell">금</div>
        <div class="dow-cell sat">토</div>
      </div>
      <div class="msc" id="msc"><div class="mtrack" id="mtrack">${html}</div></div>
    </div>`;
        return;
      }
      const msc = document.getElementById('msc');
      const old = document.getElementById('mtrack');
      if (!msc || !old) { renderMonth(null); return }
      const neo = document.createElement('div');
      neo.className = 'mtrack';
      neo.innerHTML = html;
      neo.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;transform:translateX(${dir === 'next' ? '100%' : '-100%'})`;
      old.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;';
      msc.appendChild(neo);
      neo.getBoundingClientRect();
      S.sliding = true;
      const dur = 320, ease = 'cubic-bezier(0.4,0,0.2,1)';
      old.style.transition = `transform ${dur}ms ${ease}`;
      neo.style.transition = `transform ${dur}ms ${ease}`;
      old.style.transform = `translateX(${dir === 'next' ? '-100%' : '100%'})`;
      neo.style.transform = 'translateX(0)';
      neo.addEventListener('transitionend', () => {
        old.remove();
        neo.id = 'mtrack';
        neo.style.cssText = '';
        S.sliding = false;
      }, { once: true });
    }

    /* ══════════════════════════ RENDER YEAR ══════════════════════════ */
    function renderYear() {
      const today = td();
      let html = `<div class="yv"><div class="ygrid">`;
      for (let m = 0; m < 12; m++) {
        const isCur = m === NOW.getMonth() && S.y === NOW.getFullYear();
        html += `<div class="mmth${isCur ? ' curmo' : ''}" data-mo="${m}">`;
        html += `<div class="mmth-ttl">${MO[m]}</div><div class="minigrid">`;
        ['일', '월', '화', '수', '목', '금', '토'].forEach((d, i) => html += `<div class="mndow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${d}</div>`);
        const fd = new Date(S.y, m, 1).getDay();
        const dim = new Date(S.y, m + 1, 0).getDate();
        const dpm = new Date(S.y, m, 0).getDate();
        let cells = [];
        for (let i = fd - 1; i >= 0; i--)cells.push({ d: dpm - i, o: true, m });
        for (let d = 1; d <= dim; d++)cells.push({ d, o: false, m });
        while (cells.length < 42) cells.push({ d: cells.length - fd - dim + 1, o: true, m });
        cells.forEach((c, idx) => {
          const dstr = ds(S.y, c.m, c.d);
          const dow = idx % 7;
          const isT = !c.o && dstr === today;
          const hasEv = !c.o && S.events.some(ev => ev.start <= dstr && ev.end >= dstr);
          let cls = 'mnday';
          if (c.o) cls += ' oth';
          if (dow === 0 && !c.o) cls += ' sun';
          if (dow === 6 && !c.o) cls += ' sat';
          if (isT) cls += ' todaymn';
          if (hasEv && !isT) cls += ' hasev';
          html += `<div class="${cls}">${c.d}</div>`;
        });
        html += `</div></div>`;
      }
      html += `</div></div>`;
      document.getElementById('vwrap').innerHTML = html;
    }

    /* ══════════════════════════ RENDER DAY ══════════════════════════ */
    let nowTimer = null;
    function renderDay() {
      if (nowTimer) clearInterval(nowTimer);
      const dstr = ds(S.y, S.m, S.d);
      const dobj = pd(dstr);
      const isT = dstr === td();
      const allDayEvs = S.events.filter(ev => ev.allDay && ev.start <= dstr && ev.end >= dstr);
      const timedEvs = S.events.filter(ev => !ev.allDay && ev.start === dstr);
      const total = 24 * HH;

      let trowsHTML = '';
      for (let h = 0; h < 24; h++) {
        let lbl = '';
        if (h > 0) { lbl = h < 12 ? `오전 ${h}시` : h === 12 ? '오후 12시' : `오후 ${h - 12}시` }
        trowsHTML += `<div class="trow" data-hr="${h}" style="height:${HH}px"><div class="tlabel">${lbl}</div><div class="tslot"></div></div>`;
      }

      let adHTML = '';
      if (allDayEvs.length) {
        adHTML = `<div class="dv-allday">`;
        allDayEvs.forEach(ev => {
          adHTML += `<div class="evbar ${ev.color}" data-eid="${ev.id}" style="position:static;display:inline-flex;align-items:center;height:22px;font-size:.68rem;border-radius:20px;padding:0 10px;pointer-events:all;cursor:pointer">${ev.title}</div>`;
        });
        adHTML += `</div>`;
      }

      // timed event blocks with simple column collision
      timedEvs.sort((a, b) => a.startTime < b.startTime ? -1 : 1);
      const cols = [];
      let blocksHTML = '';
      timedEvs.forEach(ev => {
        const [sh, sm] = ev.startTime.split(':').map(Number);
        const [eh, em] = ev.endTime.split(':').map(Number);
        const stMin = sh * 60 + sm, enMin = eh * 60 + em;
        const top = stMin / 60 * HH;
        const ht = Math.max((enMin - stMin) / 60 * HH, 28);
        let col = 0;
        while (cols[col] && cols[col] > stMin) col++;
        cols[col] = enMin;
        const nCols = Math.max(cols.filter(Boolean).length, 1);
        const L = 2 + col * (96 / nCols);
        const W = 94 / nCols - 2;
        blocksHTML += `<div class="devblock ${ev.color}" data-eid="${ev.id}" style="top:${top}px;height:${ht}px;left:${L}%;width:${W}%">
      <div class="dev-ttl">${ev.title}</div>
      ${ht > 36 ? `<div class="dev-tm">${fmtTime(ev.startTime)} - ${fmtTime(ev.endTime)}</div>` : ''}
    </div>`;
      });

      const n = new Date();
      const nowTop = isT ? (n.getHours() * 60 + n.getMinutes()) / 60 * HH : 0;

      document.getElementById('vwrap').innerHTML = `<div class="dv">
    <div class="dv-hdr">
      <div>
        <div class="dv-dow">${DW[dobj.getDay()]}요일</div>
        <div class="dv-circle ${isT ? 'istoday' : 'nottoday'}">${S.d}</div>
      </div>
    </div>
    ${adHTML}
    <div class="dv-scroll" id="dvScroll">
      <div class="tgrid" style="height:${total}px">
        ${trowsHTML}
        <div class="devlayer" id="devLayer" style="height:${total}px">
          ${blocksHTML}
          ${isT ? `<div class="nowdot" id="nowDot" style="top:${nowTop}px"></div><div class="nowline" id="nowLine" style="top:${nowTop}px"></div>` : ''}
        </div>
      </div>
    </div>
  </div>`;

      const sc = document.getElementById('dvScroll');
      if (sc) sc.scrollTop = Math.max(0, isT ? nowTop - 200 : 7 * HH);

      if (isT) {
        nowTimer = setInterval(() => {
          const x = new Date();
          const t = (x.getHours() * 60 + x.getMinutes()) / 60 * HH;
          const dot = document.getElementById('nowDot'), ln = document.getElementById('nowLine');
          if (dot) dot.style.top = t + 'px';
          if (ln) ln.style.top = t + 'px';
        }, 60000);
      }
    }

    /* ══════════════════════════ HEADER ══════════════════════════ */
    function updateHeader() {
      let h = '';
      if (S.view === 'year') h = `<em>${S.y}</em>년`;
      else if (S.view === 'month') h = `<em>${MO[S.m]}</em> ${S.y}`;
      else h = `<em>${S.m + 1}월 ${S.d}일</em> ${S.y}`;
      document.getElementById('hdrTitle').innerHTML = h;
      document.querySelectorAll('.vtab').forEach(t => t.classList.toggle('on', t.dataset.v === S.view));
    }

    /* ══════════════════════════ RENDER ══════════════════════════ */
    function render(dir) {
      updateHeader();
      if (S.view === 'year') renderYear();
      else if (S.view === 'month') renderMonth(dir);
      else renderDay();
    }

    /* ══════════════════════════ NAVIGATION ══════════════════════════ */
    document.getElementById('btnPrev').onclick = () => nav(-1);
    document.getElementById('btnNext').onclick = () => nav(1);
    document.getElementById('btnToday').onclick = () => {
      S.y = NOW.getFullYear(); S.m = NOW.getMonth(); S.d = NOW.getDate(); render(null);
    };
    document.querySelectorAll('.vtab').forEach(t => {
      t.onclick = () => { S.view = t.dataset.v; render(null) };
    });

    function nav(dir) {
      if (S.sliding) return;
      if (S.view === 'year') { S.y += dir; render(null) }
      else if (S.view === 'month') {
        S.m += dir;
        if (S.m > 11) { S.m = 0; S.y++ }
        if (S.m < 0) { S.m = 11; S.y-- }
        render(dir > 0 ? 'next' : 'prev');
      } else {
        const x = pd(ds(S.y, S.m, S.d));
        x.setDate(x.getDate() + dir);
        S.y = x.getFullYear(); S.m = x.getMonth(); S.d = x.getDate();
        render(null);
      }
    }

    /* ══════════════════════════ DRAG ══════════════════════════ */
    const vwrap = document.getElementById('vwrap');

    vwrap.addEventListener('mousedown', e => {
      if (S.view !== 'month') return;
      if (e.target.closest('[data-eid],.dnum')) return;
      const cell = e.target.closest('.dc[data-date]:not(.dm)');
      if (!cell) return;
      e.preventDefault();
      S.drag.on = true; S.drag.anch = cell.dataset.date; S.drag.cur = cell.dataset.date;
      hlDrag();
    });

    vwrap.addEventListener('mouseover', e => {
      if (!S.drag.on) return;
      const cell = e.target.closest('.dc[data-date]:not(.dm)');
      if (!cell) return;
      S.drag.cur = cell.dataset.date;
      hlDrag();
      const dates = rangeDates(S.drag.anch, S.drag.cur);
      const badge = document.getElementById('dragBadge');
      if (dates.length > 1) { badge.textContent = `${dates.length}일 선택`; badge.style.display = 'block' }
      else badge.style.display = 'none';
    });

    document.addEventListener('mouseup', () => {
      if (!S.drag.on) return;
      S.drag.on = false;
      document.getElementById('dragBadge').style.display = 'none';
      const dates = rangeDates(S.drag.anch, S.drag.cur).sort();
      S.drag.anch = null; S.drag.cur = null;
      clearDragHL();
      if (dates.length) openForm({ allDay: true, dates });
    });

    document.addEventListener('mousemove', e => {
      const b = document.getElementById('dragBadge');
      if (S.drag.on) { b.style.left = (e.clientX + 14) + 'px'; b.style.top = (e.clientY - 10) + 'px' }
    });

    function hlDrag() {
      const set = new Set(rangeDates(S.drag.anch, S.drag.cur));
      document.querySelectorAll('.dc[data-date]').forEach(c => {
        const d = c.dataset.date;
        c.classList.toggle('indrag', set.has(d) && d !== S.drag.anch);
        c.classList.toggle('draganchor', d === S.drag.anch);
      });
    }
    function clearDragHL() {
      document.querySelectorAll('.dc').forEach(c => c.classList.remove('indrag', 'draganchor'));
    }

    /* ══════════════════════════ CLICK DELEGATION ══════════════════════════ */
    vwrap.addEventListener('click', e => {
      // Event bar / chip click
      const bar = e.target.closest('[data-eid]');
      if (bar) { e.stopPropagation(); openDetail(bar.dataset.eid); return }

      // Month: click date number → day view
      if (S.view === 'month') {
        const dn = e.target.closest('.dnum');
        if (dn) {
          const cell = dn.closest('.dc[data-date]:not(.dm)');
          if (cell) {
            const x = pd(cell.dataset.date);
            S.y = x.getFullYear(); S.m = x.getMonth(); S.d = x.getDate();
            S.view = 'day'; render(null); return;
          }
        }
      }

      // Day view: click time row → add timed event
      if (S.view === 'day') {
        const tr = e.target.closest('.trow[data-hr]');
        if (tr && !e.target.closest('[data-eid]')) {
          const hr = parseInt(tr.dataset.hr);
          openForm({
            allDay: false,
            dates: [ds(S.y, S.m, S.d)],
            startTime: `${String(hr).padStart(2, '0')}:00`,
            endTime: `${String((hr + 1) % 24).padStart(2, '0')}:00`,
          });
        }
      }

      // Year: click mini month → go to month view
      if (S.view === 'year') {
        const mm = e.target.closest('.mmth[data-mo]');
        if (mm) { S.m = parseInt(mm.dataset.mo); S.view = 'month'; render(null) }
      }
    });

    /* ══════════════════════════ FORM MODAL ══════════════════════════ */
    function openForm(opts) {
      const f = S.form;
      f.mode = opts.editId ? 'edit' : 'add';
      f.editId = opts.editId || null;
      f.allDay = opts.allDay;
      f.dates = opts.dates || [];
      f.color = opts.color || 'gold';

      document.getElementById('fmTtl').textContent = f.mode === 'edit' ? '일정 수정' : '일정 추가';
      document.getElementById('fmSavBtn').textContent = f.mode === 'edit' ? '수정' : '저장';
      document.getElementById('fmTitle').value = opts.title || '';
      document.getElementById('fmMemo').value = opts.memo || '';

      if (f.allDay) {
        document.getElementById('fmDateFg').style.display = '';
        document.getElementById('fmTimeFg').style.display = 'none';
        document.getElementById('fmS').value = f.dates[0] || '';
        document.getElementById('fmE').value = f.dates[f.dates.length - 1] || f.dates[0] || '';
        document.getElementById('fmSub').textContent = f.dates.length ? fmtRange(f.dates[0], f.dates[f.dates.length - 1]) : '';
      } else {
        document.getElementById('fmDateFg').style.display = 'none';
        document.getElementById('fmTimeFg').style.display = '';
        document.getElementById('fmST').value = opts.startTime || '09:00';
        document.getElementById('fmET').value = opts.endTime || '10:00';
        document.getElementById('fmSub').textContent = f.dates[0] ? fmtShort(f.dates[0]) : '';
      }

      setColor(f.color);
      openM('fmModal');
      setTimeout(() => document.getElementById('fmTitle').focus(), 240);
    }

    function setColor(c) {
      S.form.color = c;
      document.querySelectorAll('.co').forEach(el => {
        el.classList.toggle('on', el.dataset.c === c);
        el.textContent = el.dataset.c === c ? '✓' : '';
      });
    }
    function pickC(el) { setColor(el.dataset.c) }

    function saveForm() {
      const title = document.getElementById('fmTitle').value.trim();
      if (!title) { document.getElementById('fmTitle').focus(); return }
      const memo = document.getElementById('fmMemo').value.trim();
      const f = S.form;

      if (f.mode === 'edit' && f.editId) {
        const ev = S.events.find(e => e.id === f.editId);
        if (ev) {
          ev.title = title; ev.memo = memo; ev.color = f.color;
          if (ev.allDay) {
            ev.start = document.getElementById('fmS').value || ev.start;
            ev.end = document.getElementById('fmE').value || ev.end;
            if (ev.end < ev.start) ev.end = ev.start;
          } else {
            ev.startTime = document.getElementById('fmST').value;
            ev.endTime = document.getElementById('fmET').value;
          }
        }
      } else {
        if (f.allDay) {
          const start = document.getElementById('fmS').value || f.dates[0];
          let end = document.getElementById('fmE').value || f.dates[f.dates.length - 1] || start;
          if (end < start) end = start;
          S.events.push({ id: `ev${Date.now()}${Math.random().toString(36).slice(2)}`, title, memo, color: f.color, allDay: true, start, end });
        } else {
          S.events.push({
            id: `ev${Date.now()}${Math.random().toString(36).slice(2)}`,
            title, memo, color: f.color, allDay: false,
            start: f.dates[0] || ds(S.y, S.m, S.d),
            end: f.dates[0] || ds(S.y, S.m, S.d),
            startTime: document.getElementById('fmST').value || '09:00',
            endTime: document.getElementById('fmET').value || '10:00',
          });
        }
      }
      save(); closeM('fmModal'); render(null);
    }

    /* ══════════════════════════ DETAIL MODAL ══════════════════════════ */
    function openDetail(id) {
      const ev = S.events.find(e => e.id === id);
      if (!ev) return;
      S.detId = id;
      document.getElementById('detBar').style.background = COLMAP[ev.color] || COLMAP.gold;
      document.getElementById('detTtl').textContent = ev.title;
      document.getElementById('detMemo').textContent = ev.memo || '(메모 없음)';
      let dt = ev.allDay ? fmtRange(ev.start, ev.end) : `${fmtShort(ev.start)}  ${fmtTime(ev.startTime)} - ${fmtTime(ev.endTime)}`;
      document.getElementById('detDt').textContent = dt;
      openM('detModal');
    }

    function doDelete() {
      S.events = S.events.filter(e => e.id !== S.detId);
      save(); closeM('detModal'); render(null);
    }

    function doEdit() {
      const ev = S.events.find(e => e.id === S.detId);
      if (!ev) return;
      closeM('detModal');
      openForm({
        editId: ev.id, allDay: ev.allDay,
        dates: ev.allDay ? rangeDates(ev.start, ev.end) : [ev.start],
        startTime: ev.startTime, endTime: ev.endTime,
        title: ev.title, memo: ev.memo, color: ev.color,
      });
    }

    /* ══════════════════════════ MODAL UTILS ══════════════════════════ */
    function openM(id) { document.getElementById(id).classList.add('open') }
    function closeM(id) { document.getElementById(id).classList.remove('open') }
    document.querySelectorAll('.overlay').forEach(o => o.addEventListener('mousedown', e => { if (e.target === o) closeM(o.id) }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeM('fmModal'); closeM('detModal') }
      if (e.key === 'Enter' && !e.shiftKey && document.getElementById('fmModal').classList.contains('open') && document.activeElement.tagName !== 'TEXTAREA') saveForm();
    });


    // ════════════════════════════════════════════
    //  AUTH STATE & UI
    // ════════════════════════════════════════════
    onAuthStateChanged(auth, user => {
      S.currentUser = user;
      $('loadingScreen').style.display = 'none';

      if (user) {
        const isEmail = user.providerData.some(p => p.providerId === 'password');
        if (isEmail && !user.emailVerified) {
          stopSync(); showPage('verifyPage');
          $('verifyEmail').textContent = user.email;
          startVerifyPolling();
        } else {
          updateUserAvatar(user);
          showPage('appPage');
          startSync(user.uid);
        }
      } else {
        stopSync(); S.events = []; S.nativeEvents = []; S.docs = []; render(null);
        showPage('authPage');
        renderAuthForm();
      }
    });

    function showPage(id) {
      ['loadingScreen', 'authPage', 'verifyPage', 'appPage'].forEach(p => {
        const el = $(p);
        if (el) el.style.display = p === id ? 'flex' : 'none';
      });
    }

    function updateUserAvatar(user) {
      const avatar = $('userAvatar');
      const nameEl = $('userDisplayName');
      const emailEl = $('userDisplayEmail');
      if (!avatar) return;
      const name = user.displayName || user.email || '';
      const initial = name.charAt(0).toUpperCase();
      if (user.photoURL) {
        avatar.style.backgroundImage = `url(${user.photoURL})`;
        avatar.style.backgroundSize = 'cover';
        avatar.textContent = '';
      } else {
        avatar.style.backgroundImage = '';
        avatar.textContent = initial;
      }
      if (nameEl) nameEl.textContent = user.displayName || '';
      if (emailEl) emailEl.textContent = user.email || '';
    }

    window.toggleUserMenu = function () {
      const dd = $('userDropdown');
      if (!dd) return;
      dd.classList.toggle('open');
    };

    document.addEventListener('click', e => {
      const menu = $('userMenu');
      if (menu && !menu.contains(e.target)) {
        const dd = $('userDropdown');
        if (dd) dd.classList.remove('open');
      }
    });

    // Auth UI logic from wikimind
    let authMode = 'login';
    window.setAuthMode = function (m) { authMode = m; clearAuthMsg(); renderAuthForm(); };

    function renderAuthForm() {
      const L = authMode === 'login', R = authMode === 'reset', Sg = authMode === 'signup';
      $('authNameWrap').style.display = Sg ? 'block' : 'none';
      $('authSocial').style.display = R ? 'none' : 'flex';
      $('authDivider').style.display = R ? 'none' : 'flex';
      $('authPasswordWrap').style.display = R ? 'none' : 'block';
      const btn = $('authSubmitBtn');
      btn.textContent = L ? '로그인' : Sg ? '회원가입' : '재설정 링크 보내기';
      btn.onclick = R ? handleReset : () => handleEmailAuth(Sg);
      $('authFooter').innerHTML = L
        ? `<span class="auth-link" onclick="setAuthMode('signup')">회원가입</span><span class="auth-link" onclick="setAuthMode('reset')">비밀번호 찾기</span>`
        : Sg ? `<span class="auth-link" onclick="setAuthMode('login')">이미 계정이 있으신가요? 로그인</span>`
          : `<span class="auth-link" onclick="setAuthMode('login')">← 로그인으로 돌아가기</span>`;
    }

    async function handleEmailAuth(isSignup) {
      const email = $('authEmail').value.trim();
      const pass = $('authPassword').value;
      if (!email || !pass) return;
      setAuthLoading(true); clearAuthMsg();
      try {
        if (isSignup) {
          const { user } = await createUserWithEmailAndPassword(auth, email, pass);
          await sendEmailVerification(user);
          showPage('verifyPage');
          $('verifyEmail').textContent = user.email;
          startVerifyPolling();
        } else {
          await signInWithEmailAndPassword(auth, email, pass);
        }
      } catch (e) { showAuthMsg(e.message, 'err'); }
      setAuthLoading(false);
    }

    window.handleSocialLogin = async function (provider) {
      setAuthLoading(true); clearAuthMsg();
      try { await signInWithPopup(auth, provider); }
      catch (e) { if (e.code !== 'auth/popup-closed-by-user') showAuthMsg(e.message, 'err'); }
      setAuthLoading(false);
    };

    window.handleSignOut = async function () { await signOut(auth); };

    function setAuthLoading(on) {
      $('authSubmitBtn').disabled = on;
      $('authSubmitBtn').textContent = on ? '처리 중...' : (authMode === 'login' ? '로그인' : authMode === 'signup' ? '회원가입' : '재설정 링크 보내기');
    }
    function showAuthMsg(m, type) { const e = $('authError'); e.textContent = m; e.style.display = 'block'; e.className = 'auth-msg ' + type; }
    function clearAuthMsg() { $('authError').style.display = 'none'; }

    let verifyPoller = null;
    function startVerifyPolling() {
      clearInterval(verifyPoller);
      verifyPoller = setInterval(async () => {
        const u = auth.currentUser; if (!u) { clearInterval(verifyPoller); return; }
        await reload(u);
        if (u.emailVerified) { clearInterval(verifyPoller); showPage('appPage'); startSync(u.uid); }
      }, 5000);
    }

    // ════════════════════════════════════════════
    //  SYNC CALENDAR EVENTS & WIKIMIND DOCS
    // ════════════════════════════════════════════
    let unsubEvents = null, unsubDocs = null;
    function startSync(uid) {
      stopSync();
      // 1. Sync Native Calendar Events
      unsubEvents = onSnapshot(doc(db, 'users', uid, 'events', 'calv4'), snap => {
        if (snap.exists()) {
          try { S.nativeEvents = JSON.parse(snap.data().data || '[]'); } catch (e) { S.nativeEvents = []; }
        } else { S.nativeEvents = []; }
        combineEvents();
      });

      // 2. Sync WikiMind Docs to extract [일정]
      const q = query(collection(db, 'users', uid, 'docs'), orderBy('updatedAt', 'desc'));
      unsubDocs = onSnapshot(q, snap => {
        S.docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        combineEvents();
      });
    }

    function stopSync() {
      if (unsubEvents) { unsubEvents(); unsubEvents = null; }
      if (unsubDocs) { unsubDocs(); unsubDocs = null; }
    }

    function combineEvents() {
      const docEvents = [];
      const regex = /^📅\[([a-zA-Z0-9]+)\]\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?(?:\s+~(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(\d{2}:\d{2}))?)?\s+([^\n]+)/gm;

      S.docs.forEach(d => {
        if (!d.content) return;
        let match;
        while ((match = regex.exec(d.content)) !== null) {
          const id = match[1];
          const start = match[2];
          const startTime = match[3];
          const end = match[4] || start;
          const endTime = match[5] || (startTime ? '10:00' : undefined);
          const title = match[6];
          docEvents.push({
            id: id,
            title: title,
            memo: '(WikiMind 노트 연동 일정)',
            color: 'purple',
            allDay: !startTime,
            start, end, startTime, endTime,
            isDocEvent: true,
            docId: d.id
          });
        }
      });

      S.events = [...S.nativeEvents, ...docEvents];
      render(null);
    }

    // Allow global methods
    window.closeM = closeM;
    window.pickC = pickC;
    window.saveForm = saveForm;
    window.doDelete = doDelete;
    window.doEdit = doEdit;

    // We need to modify saveForm and doDelete to handle doc events!
    const origSaveForm = saveForm;
    window.saveForm = async function () {
      const f = S.form;
      if (f.mode === 'edit' && f.editId) {
        const ev = S.events.find(e => e.id === f.editId);
        if (ev && ev.isDocEvent) {
          // NOTE EVENT UPDATE!
          const title = $('fmTitle').value.trim();
          if (!title) return;
          const start = f.allDay ? ($('fmS').value || ev.start) : (ev.start);
          // Construct the new string
          let timeStr = "";
          if (!f.allDay) timeStr = " " + ($('fmST').value || '09:00');
          let end = f.allDay ? ($('fmE').value || ev.end) : "";
          if (end && end !== start) timeStr += " ~ " + end;
          // Note: for simplicity in WikiMind markdown we might just support basic start/time changes.
          // E.g. 📅[id] 2026-04-05 10:00 새제목
          const newStr = `📅[${ev.id}] ${start}${timeStr} ${title}`;

          const docRef = doc(db, 'users', S.currentUser.uid, 'docs', ev.docId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            let content = snap.data().content;
            const replaceRegex = new RegExp(`^📅\\[${ev.id}\\].*\\n?`, "m");
    content = content.replace(replaceRegex, newStr);
    await setDoc(docRef, { content, updatedAt: serverTimestamp() }, { merge: true });
      }
    closeM('fmModal');
    return;
    }
  }

    if (f.mode === 'add' && f.allDay === undefined) {
      // some default fallback
    }

    // Call the original but without save() -> Instead we modify S.nativeEvents and save
    const title = $('fmTitle').value.trim();
    if (!title) { $('fmTitle').focus(); return }
    const memo = $('fmMemo').value.trim();

    if (f.mode === 'edit' && f.editId) {
      const nev = S.nativeEvents.find(e => e.id === f.editId);
      if (nev) {
        nev.title = title; nev.memo = memo; nev.color = f.color;
        if (nev.allDay) {
          nev.start = $('fmS').value || nev.start;
          nev.end = $('fmE').value || nev.end;
          if (nev.end < nev.start) nev.end = nev.start;
        } else {
          nev.startTime = $('fmST').value;
          nev.endTime = $('fmET').value;
        }
      }
    } else {
      if (f.allDay) {
        const start = $('fmS').value || f.dates[0];
        let end = $('fmE').value || f.dates[f.dates.length - 1] || start;
        if (end < start) end = start;
        S.nativeEvents.push({ id: `ev${Date.now()}`, title, memo, color: f.color, allDay: true, start, end });
      } else {
        S.nativeEvents.push({
          id: `ev${Date.now()}`,
          title, memo, color: f.color, allDay: false,
          start: f.dates[0] || ds(S.y, S.m, S.d),
          end: f.dates[0] || ds(S.y, S.m, S.d),
          startTime: $('fmST').value || '09:00',
          endTime: $('fmET').value || '10:00',
        });
      }
    }
    save(); closeM('fmModal'); combineEvents();
  }

    const origDoDelete = doDelete;
    window.doDelete = async function () {
      const ev = S.events.find(e => e.id === S.detId);
      if (ev && ev.isDocEvent) {
        if (!confirm('이 일정은 노트에 연결되어 있습니다. 삭제하면 노트에서도 삭제됩니다. 계속할까요?')) return;
        const docRef = doc(db, 'users', S.currentUser.uid, 'docs', ev.docId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          let content = snap.data().content;
          const replaceRegex = new RegExp(`^📅\\[${ev.id}\\].*\n?`, "m");
          content = content.replace(replaceRegex, "");
          await setDoc(docRef, { content, updatedAt: serverTimestamp() }, { merge: true });
        }
        closeM('detModal');
        return;
      }
      S.nativeEvents = S.nativeEvents.filter(e => e.id !== S.detId);
      save(); closeM('detModal'); combineEvents();
    }

    const origRender = render;
    window.render = function (dir) {
      // Prevent duplicate hooks on global. Need to clear the HTML handlers but it's simpler to just re-assign.
      origRender(dir);
    }
    // Clean up global handlers since we use module now (but we attached them to window)

    /* ══════════════════════════ INIT ══════════════════════════ */
    load();
    render(null);
