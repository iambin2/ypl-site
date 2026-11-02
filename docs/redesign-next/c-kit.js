Object.assign(I, {
  back: '<path d="M14.5 6l-6 6 6 6"/>', chev: '<path d="M9.5 6l6 6-6 6"/>', down: '<path d="M6 9.5l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5zM4.5 16.5h15M10 19.5h4"/>', download: '<path d="M12 4.5v10M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  image: '<path d="M4 5h16v14H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5"/>',
});
const TYPE = { 에스퍼: '#F95587', 페어리: '#D685AD', 땅: '#E2BF65', 강철: '#B7B7CE', 드래곤: '#6F35FC', 비행: '#A98FF3', 악: '#8A6F5C', 고스트: '#735797', 물: '#6390F0', 불꽃: '#EE8130', 풀: '#7AC74C', 격투: '#C22E28', 노말: '#A8A77A' };
const ty = list => list.map(t => `<span class="ty"><i style="background:${TYPE[t]}"></i>${t}</span>`).join('<span style="width:8px;display:inline-block"></span>');

/* ---------- shared screen parts ---------- */
const page = (body, tab, { admin = false, dock = '', toast = '' } = {}) => `<div class="ph">${bar()}<div class="ct">${body}</div>${toast}${dock ? `<div class="dock" style="${admin ? 'bottom:104px' : ''}">${dock}</div>` : ''}${admin ? `<div class="admin"><span class="lamp"></span>관리자 모드<span style="margin-left:auto;font-weight:600">로그아웃</span></div>` : ''}${tabs(tab)}</div>`;
const head = (title, right = '') => `<div class="sh" style="margin-top:32px;align-items:flex-end"><span class="t32">${title}</span>${right}</div>`;
const sec = (title, link = '', top = 52) => `<div class="sh" style="margin-top:${top}px"><span class="t20">${title}</span>${link ? `<span class="link">${link}</span>` : ''}</div>`;
const back = to => `<a class="back t12 dim">${ic('back', 16)}${to}</a>`;
const field = (label, value, { ph = false, focus = false, right = '', top = 20 } = {}) => `<div class="fl" style="margin-top:${top}px">${label ? `<span class="t12 dim">${label}</span>` : ''}<div class="in ${focus ? 'focus' : ''}"><span class="${ph ? 'ph-t' : ''}" style="flex:1">${value}</span>${right}</div></div>`;
const search = (ph, right = '') => `<div class="fl" style="margin-top:20px;display:flex;gap:2px"><div class="in" style="flex:1;color:var(--mute)">${ic('search', 20)}<span>${ph}</span></div>${right}</div>`;
const tabsline = (items, on = 0, top = 32) => `<div class="tabsline" style="margin-top:${top}px">${items.map((t, i) => `<a class="${i === on ? 'on' : ''}">${t}</a>`).join('')}</div>`;
const counters = (list, cells = 2) => `<div class="stack" style="margin-top:20px;grid-template-columns:115px 116px 115px">${list.map(([n, l, extra = '']) => `<div class="pn" style="height:84px;padding:12px;display:flex;flex-direction:column;justify-content:space-between"><span class="t12 dim">${l}</span><span style="display:flex;align-items:flex-end;gap:6px">${seg(n, 40, cells)}${extra}</span></div>`).join('')}</div>`;
const example = `<span class="t12 mute">예시 데이터</span>`;

