// Prismo — narrativa por rolagem (index.html e booking.html).
//
// Cada seção depois do topo vira uma cena: um palco preso na tela (sticky) com uma
// linha do tempo medida em pixels de rolagem. Na linha do tempo, as peças da seção
// entram uma depois da outra, na ordem do documento; peças lado a lado entram em
// cascata. Os passos do atendimento (.steps4) não: cada um entra, faz o seu gesto
// e só então o seguinte começa. Quando a cena não cabe na tela, uma "câmera" sobe
// o conteúdo entre uma peça e outra, e o que passa do topo some sob o menu. No fim,
// tudo sai para cima e só então a cena seguinte começa a entrar, presa no mesmo lugar.
//
// Uma peça com data-beats="n" ganha n "toques" depois de entrar: a cada um, ela
// recebe o evento story:beats com quantos toques a rolagem já pediu.
//
// Sem JavaScript ou com pedido de menos movimento, nada disso liga: a página fica
// em fluxo normal, com tudo visível.
(() => {
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // O texto do topo sai enquanto se rola; o aviso de rolar apaga junto.
  const heroText = hero?.querySelector('h1')?.parentElement;
  heroText?.setAttribute('data-hero', 'text');
  const heroProgress = () => {
    if (!hero) return;
    const first = Math.min(hero.offsetHeight, innerHeight);
    hero.style.setProperty('--hp', Math.min(1, Math.max(0, scrollY / first)).toFixed(3));
  };

  const sections = [...document.querySelectorAll('main > section:not(.hero)')];
  if (reduce || !sections.length || !('ResizeObserver' in window)) {
    heroProgress();
    addEventListener('scroll', heroProgress, { passive: true });
    return;
  }
  root.classList.add('story');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // ── Durações, em fração da altura da tela ──
  const SPEED = .62;
  const LEN = { line: .22, title: .42, text: .26, item: .22, visual: .5, morph: 2.6, step: .3, feat: .3 };
  const HOLD = .22, EXIT = .42, LEAD = .55, EDGE_TOL = 64;
  // Depois de entrar, um passo do atendimento ainda faz o seu gesto (ACT); um
  // item com data-beats reserva BEAT por "toque" de demonstração.
  const ACT = .26, BEAT = .32;

  const ITEM = [
    '.chapter-line', 'h2', '.lede', '.for', '.styles', '.editor',
    '.steps4 > figure', '.camp > figure', '.viz', '.tags', '.more > div', '.trio > div',
    '.feats > figure', '.mplayer', '.path > li', '.aviso', '.faq details', '.cta .btn', '.cta .mail',
    '.showcase', '.next', '.ways > div',
  ].join(',');
  const PART = [
    '.slots .chip', '.viz-head', '.agenda li', '.viz-foot', '.big', '.bars span', '.legend', '.paysplit i',
    '.heat span', '.ret > *', '.pros li', '.compare .stack span', '.col b', '.col small', '.plans-mini > div',
    '.renew li', '.recipes li', '.note', '.reach-row span', '.gain', '.mrr span', '.mrr-x',
    '.mp-cover', '.mp-top', '.mp-meta > *', '.mp-fav', '.mp-prog', '.mp-ctrl', '.mp-out', '.path-ui > *',
    '.cal-head', '.cal-col .blk', '.cal-now', '.mini-head', '.att-row > span', '.day-row > span', '.day-money',
    '.toast > *', '.book > *', '.sorts', '.clients li', '.owe li', '.owe-btn', '.hire > *', '.comm > div',
    '.strip > span', '.keys', '.views > span', '.log li',
    '.editor .phone', '.editor h3', '.editor .lede', '.editor .picks-label', '.editor .picks', 'figcaption',
    '.product-name', '.showcase h3', '.showcase .lede', '.tags li', '.showcase .btn', '.fan .phone',
  ].join(',');

  const kindOf = el => el.matches('.chapter-line') ? 'line'
    : el.matches('h2') ? 'title'
    : el.matches('.styles') ? 'morph'
    : el.matches('figure, .viz, .editor, .showcase, .mplayer, .path > li') ? 'visual'
    : el.matches('.lede, .for, .aviso, .mail, .more > div, .trio > div, .ways > div, .next') ? 'text'
    : 'item';
  const partKind = el => el.matches('.bars span, .mrr span') ? 'grow'
    : el.matches('.heat span, .slots .chip, .strip > span') ? 'cell'
    : el.matches('.agenda li, .pros li, .queue li, .renew li, .clients li, .owe li, .log li') ? 'side'
    : 'rise';

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => t * t * (3 - 2 * t);
  const outCubic = t => 1 - (1 - t) ** 3;
  const setVar = (el, name, v, key) => {
    const s = v.toFixed(3);
    if (el[key] !== s) { el[key] = s; el.style.setProperty(name, s); }
  };

  // ── Montagem das cenas ──
  const ambient = document.createElement('div');
  ambient.className = 'ambient';
  ambient.setAttribute('aria-hidden', 'true');
  document.body.prepend(ambient);

  const scenes = sections.map((section, i) => {
    const chapter = section.previousElementSibling?.classList.contains('divider');
    const stage = document.createElement('div');
    const inner = document.createElement('div');
    stage.className = 'stage';
    inner.className = 'scene-inner';
    inner.append(...section.childNodes);
    if (chapter) {
      const line = document.createElement('div');
      line.className = 'wrap divider chapter-line';
      line.setAttribute('aria-hidden', 'true');
      inner.prepend(line);
    }
    stage.append(inner);
    section.append(stage);
    // A câmera move o conteúdo por transformação; imagens "lazy" chegariam atrasadas.
    inner.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });

    const found = [...inner.querySelectorAll(ITEM)];
    const items = found.filter(el => !found.some(o => o !== el && o.contains(el))).map(el => {
      const kind = kindOf(el);
      el.dataset.k = kind;
      const parts = kind === 'visual' || kind === 'item' && el.matches('.tags')
        ? [...el.querySelectorAll(PART)].map(p => (p.dataset.p = partKind(p), { el: p })) : [];
      const m = parts.length;
      const step = 1 / (m + 1), plen = 2 * step;
      parts.forEach((p, j) => { p.s = .18 + j * step * .82; p.l = plen * .82; });
      let len = LEN[kind];
      const steps = el.matches('.steps4 > figure');
      if (steps) len = LEN.step + Math.min(.15, m * .012);
      else if (el.matches('.feats > figure, .path > li')) len = LEN.feat + Math.min(.12, m * .01);
      else if (kind === 'visual') len += Math.min(.45, m * .018);
      if (el.matches('.tags')) len = LEN.item + Math.min(.3, m * .05);
      return { el, kind, len, parts, steps, seq: !!el.parentElement.closest('[data-seq]'), beats: +el.dataset.beats || 0 };
    });
    inner.querySelectorAll('.steps4').forEach(row => {
      [...row.children].forEach((f, k) => { const it = items.find(x => x.el === f); if (it) it.k = k; });
    });
    const hue = getComputedStyle(section).getPropertyValue('--hue').trim();
    return { section, stage, inner, items, i, first: i === 0, last: i === sections.length - 1, hue };
  });
  document.querySelector('.steps4')?.classList.add('armed');

  // Topo de um elemento dentro da cena, sem contar transformações.
  const relTop = (el, inner) => {
    let y = 0, n = el;
    while (n && n !== inner) { y += n.offsetTop; n = n.offsetParent; }
    return y;
  };

  let vh = 0, headH = 0;
  const layout = () => {
    vh = scenes[0].stage.clientHeight;
    headH = document.querySelector('header')?.offsetHeight || 72;
    const padTop = headH + 28, padBot = 28, U = vh - padTop - padBot;
    for (const sc of scenes) {
      const C = sc.inner.offsetHeight, fits = C <= U;
      sc.vh = vh; sc.padTop = padTop;
      sc.base = fits ? padTop + (U - C) / 2 : padTop;
      sc.lead = sc.first ? vh * LEAD : 0;
      const keys = [[0, 0]];
      let s = 0, cam = 0, prev = null;
      for (const it of sc.items) {
        const top = relTop(it.el, sc.inner), bot = top + it.el.offsetHeight;
        it.top = top; it.h = bot - top;
      }
      for (const it of sc.items) {
        const top = it.top, bot = top + it.h;
        let move = null;
        if (!fits && bot - U > cam + 1) {
          // Sobe só até uma borda que não corte nenhuma peça ao meio no topo.
          const need = bot - U;
          const cuts = e => sc.items.some(o => o.top < e - 2 && o.top + o.h > e + 2);
          const edge = sc.items.flatMap(o => [o.top, o.top + o.h + 1])
            .filter(e => e >= need - EDGE_TOL && e <= top && !cuts(e)).sort((p, q) => p - q)[0];
          // Uma sobra pequena no topo (até EDGE_TOL) fica sob o esmaecido do menu.
          const target = edge === undefined ? top : Math.max(edge, need);
          keys.push([s, cam]);
          move = [s, s + (target - cam)];
          s += target - cam;
          keys.push([s, target]);
          cam = target; prev = null;
        }
        const len = it.len * vh * SPEED;
        const tail = it.steps ? ACT * vh * SPEED : it.beats * BEAT * vh * SPEED;
        // Peça que chega com a câmera: entra enquanto sobe, sem deixar a tela vazia.
        // Lado a lado, as peças entram em cascata; numa fila com data-seq (os passos
        // do atendimento, o caminho de adoção), não: cada uma espera a anterior terminar.
        const beside = prev && Math.abs(top - prev.top) < 8;
        const a = move ? move[0] + (move[1] - move[0]) * .35
          : beside ? (it.seq && prev.seq ? prev.b : prev.a + prev.len * .45) : s;
        it.a = a; it.e = Math.max(a + len, move ? move[1] : 0); it.b = it.t = it.e + tail;
        // Peça mais alta que a tela (o editor, no celular): depois de entrar (e de
        // tocar os seus toques), a câmera desce por ela até mostrar o pé.
        it.tall = !fits && it.h > U;
        if (it.tall && bot - U > cam + 1) {
          keys.push([it.b, cam]);
          it.b += bot - U - cam;
          cam = bot - U;
          keys.push([it.b, cam]);
        }
        s = Math.max(s, it.b);
        prev = { top, a, len, b: it.b, seq: it.seq };
      }
      keys.push([s, cam]);
      s += HOLD * vh * SPEED;
      sc.exitA = s;
      if (!sc.last) s += EXIT * vh * SPEED;
      sc.T = Math.max(s, sc.lead + 1);
      sc.keys = keys;
      // Onde um link para esta seção deve parar: título e primeiro texto já na tela.
      const firstText = sc.items.find(it => it.kind === 'text' || it.kind === 'visual' || it.kind === 'morph');
      sc.landing = sc.last ? sc.exitA : Math.max(sc.lead, (firstText || sc.items[0])?.b || 0) + 2;

      sc.section.style.height = `${Math.round(vh + sc.T - sc.lead)}px`;
      sc.section.style.marginTop = sc.first ? '' : `${-vh}px`;
    }
    for (const sc of scenes) sc.start = sc.section.getBoundingClientRect().top + scrollY - sc.lead;
  };

  const camAt = (keys, s) => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      const [s1, c1] = keys[k];
      if (s <= s1) {
        const [s0, c0] = keys[k - 1];
        return s1 === s0 ? c1 : c0 + (c1 - c0) * (s - s0) / (s1 - s0);
      }
    }
    return keys[keys.length - 1][1];
  };

  // A troca de estilos: o celular aparece e a tela passa pelos outros estilos.
  const morph = (el, t) => {
    const figs = [...el.children];
    setVar(el, '--r', smooth(clamp01(t / .16)), '_r');
    const w = figs.map((_, k) => k === 0 ? 1 : clamp01((t - (.18 + (k - 1) * .27)) / .22));
    figs.forEach((f, k) => {
      if (k) {
        const ws = `${(w[k] * 114).toFixed(2)}%`;
        if (f._w !== ws) { f._w = ws; f.style.setProperty('--wipe', ws); }
        setVar(f, '--band', Math.sin(Math.PI * w[k]), '_b');
      }
      // A legenda atual sai na primeira metade da cortina; a nova entra na segunda.
      const on = clamp01((w[k] - .55) / .25), off = k < figs.length - 1 ? clamp01((w[k + 1] - .2) / .25) : 0;
      const cap = f.querySelector('figcaption');
      if (!cap) return;
      setVar(cap, '--c', k === 0 ? 1 - off : on * (1 - off), '_c');
      const dy = off > 0 ? -off * 16 : (1 - on) * 16;
      cap.style.setProperty('--cy', `${dy.toFixed(1)}px`);
    });
  };

  let current = null;
  const apply = (sc, s) => {
    // Só a cena da vez recebe toques. A seção seguinte já cobre o pé da tela
    // antes de a cena dela começar, invisível, e roubaria o clique do que está à mostra.
    const live = s >= 0 && (sc.last || s < sc.T);
    if (live !== sc.live) { sc.live = live; sc.section.classList.toggle('idle', !live); }
    const y0 = sc.base - camAt(sc.keys, s);
    sc.inner.style.transform = `translate3d(0, ${y0.toFixed(1)}px, 0)`;
    const xt = sc.last ? 0 : clamp01((s - sc.exitA) / (EXIT * sc.vh * SPEED));
    const n = sc.items.length;
    sc.items.forEach((it, idx) => {
      const t = clamp01((s - it.a) / (it.e - it.a));
      if (it.kind === 'morph') morph(it.el, t);
      else setVar(it.el, '--r', smooth(clamp01(it.parts.length ? t / .45 : t)), '_r');
      for (const p of it.parts) setVar(p.el, '--r', outCubic(clamp01((t - p.s) / p.l)), '_r');
      // Sai na hora certa: no fim da cena, em cascata; ou antes, se a câmera o empurrar
      // para cima. A peça alta só sai quando o pé dela chega lá em cima.
      const ref = it.tall ? it.top + it.h - 200 : it.top;
      const pushed = clamp01((sc.padTop - EDGE_TOL - (y0 + ref)) / (Math.min(it.h, 200) * .5 + 1));
      const x = Math.max(clamp01((xt - idx / n * .5) / .5), pushed);
      setVar(it.el, '--x', smooth(x), '_x');
      // O gesto do passo (escolher, ler, aceitar, pagar) só começa depois que ele entrou.
      if (it.steps) {
        const act = Math.min(clamp01((s - it.e) / (it.t - it.e)), replayAt(it.k));
        setVar(it.el, '--a', act, '_a');
        setVar(it.el, '--d', Math.sin(Math.PI * act), '_d');
      }
      // Toques de demonstração: a página decide o que cada um faz e toca um de cada vez.
      if (it.beats) {
        const n = Math.max(0, Math.min(it.beats, Math.floor((s - it.e) / ((it.t - it.e) / it.beats) + .75)));
        if (n !== it.n) { it.n = n; it.el.dispatchEvent(new CustomEvent('story:beats', { detail: { n } })); }
      }
    });
    setVar(sc.inner, '--sp', clamp01(s / sc.exitA), '_sp');
  };

  // Outro horário escolhido: os passos seguintes refazem o gesto, um depois do outro.
  const REPLAY = { delay: 250, dur: 750, gap: 150 };
  let replay = null;
  const replayAt = k => {
    if (!replay || !k) return 1;
    return clamp01((performance.now() - replay.t0 - REPLAY.delay - (k - 1) * (REPLAY.dur + REPLAY.gap)) / REPLAY.dur);
  };
  document.querySelectorAll('.steps4').forEach(row => row.addEventListener('story:replay', () => {
    const sc = scenes.find(x => x.inner.contains(row));
    if (!sc) return;
    const last = row.children.length - 1;
    const end = () => REPLAY.delay + last * (REPLAY.dur + REPLAY.gap);
    replay = { t0: performance.now() };
    const tick = () => {
      if (!replay) return;
      if (performance.now() - replay.t0 > end()) replay = null;
      apply(sc, scrollY - sc.start);
      if (replay) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  let ticking = false;
  const update = () => {
    ticking = false;
    heroProgress();
    const y = scrollY;
    let active = null;
    for (const sc of scenes) {
      const s = y - sc.start;
      const zone = s < -vh ? -1 : s > sc.T + vh ? 1 : 0;
      if (zone && sc.zone === zone) continue;
      sc.zone = zone;
      apply(sc, s);
      if (!active && s >= -vh * .3 && s <= sc.T) active = sc;
    }
    if (active && active !== current) {
      current = active;
      ambient.style.setProperty('--amb', active.hue && active.hue !== getComputedStyle(root).getPropertyValue('--text').trim() ? active.hue : '#8a8a99');
    }
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  // Refaz as contas mantendo o leitor no mesmo ponto da história.
  const relayout = () => {
    const y = scrollY, at = scenes.find(sc => y >= sc.start && y < sc.start + sc.T);
    const frac = at ? (y - at.start) / at.T : null;
    layout();
    scenes.forEach(sc => { sc.zone = null; });
    if (at) scrollTo({ top: at.start + frac * at.T, behavior: 'instant' });
    update();
  };

  layout();
  const saved = sessionStorage.getItem(`story:${location.pathname}`);
  const target = location.hash && scenes.find(sc => `#${sc.section.id}` === location.hash);
  if (target) scrollTo({ top: target.start + target.landing, behavior: 'instant' });
  else if (saved) scrollTo({ top: +saved, behavior: 'instant' });
  update();

  addEventListener('scroll', request, { passive: true });
  let rt = 0, lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => {
    // Barra do navegador do celular abrindo e fechando não refaz a história.
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140) return;
    lastW = innerWidth; lastH = innerHeight;
    clearTimeout(rt); rt = setTimeout(relayout, 150);
  });
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(relayout, 120); });
  scenes.forEach(sc => ro.observe(sc.inner));
  document.fonts?.ready.then(relayout);
  addEventListener('pagehide', () => sessionStorage.setItem(`story:${location.pathname}`, String(Math.round(scrollY))));

  // Links internos (menu, "Ver o app", aviso de rolar) param onde a seção já apareceu.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    const sc = a && scenes.find(x => `#${x.section.id}` === a.getAttribute('href'));
    if (!sc) return;
    e.preventDefault();
    const top = sc.start + sc.landing;
    scrollTo({ top, behavior: Math.abs(top - scrollY) < vh * 1.5 ? 'smooth' : 'instant' });
    history.replaceState(null, '', a.getAttribute('href'));
  });

  // Teclado: ao focar algo que ainda não apareceu (ou já saiu), leva até onde ele está na tela.
  document.addEventListener('focusin', e => {
    for (const sc of scenes) {
      if (!sc.inner.contains(e.target)) continue;
      const it = sc.items.find(x => x.el.contains(e.target));
      if (!it) return;
      const s = scrollY - sc.start;
      if (s < it.b || s > sc.exitA) scrollTo({ top: sc.start + Math.min(it.b + 2, sc.exitA - 2), behavior: 'instant' });
      return;
    }
  });
})();
