// src/ui/summary.js – TOOL-SUMMARY-001
// Renders multi-file aggregate summary in #tab-summary

/* ── Constants ──────────────────────────────────────────────────────────── */

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'unset'];
const STATUS_ORDER   = ['draft', 'approved', 'implemented', 'unset'];

const PRIORITY_COLORS = {
  critical: '#dc2626',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
  unset:    '#9ca3af',
};

const STATUS_COLORS = {
  draft:         '#60a5fa',
  approved:      '#34d399',
  implemented:   '#818cf8',
  unset:         '#9ca3af',
};

/* ── Module state (reset on each render) ───────────────────────────────── */

let _allDocs   = [];
let _onNav     = null;
let _filterState = { user: '', priority: '', status: '', search: '' };
let _sortState   = { col: 'id', dir: 'asc' };

/* ── Entry point ────────────────────────────────────────────────────────── */

export function renderSummary(docs, onNavigate) {
  _allDocs = docs || [];
  _onNav   = onNavigate || (() => {});
  _filterState = { user: '', priority: '', status: '', search: '' };
  _sortState   = { col: 'id', dir: 'asc' };

  const panel = document.getElementById('tab-summary');
  if (!panel) return;

  if (_allDocs.length === 0) {
    panel.innerHTML = '<p class="summary-empty">No FRS files loaded. Drop one or more .md files to begin.</p>';
    return;
  }

  const data = aggregateDocs(_allDocs);

  panel.innerHTML = `
    <div class="summary-counts">${buildCounts(data)}</div>
    <div class="summary-row-2col">
      <div>${buildUserTable(data)}</div>
      <div>
        ${buildDistBar('Priority', data.priorities, PRIORITY_COLORS, PRIORITY_ORDER)}
        ${buildDistBar('Status',   data.statuses,   STATUS_COLORS,   STATUS_ORDER)}
      </div>
    </div>
    <div class="summary-section">
      <h3 class="summary-section-title">Dependencies</h3>
      <div id="depGraphWrap"></div>
    </div>
    <div class="summary-section">
      <h3 class="summary-section-title">Tags</h3>
      <div class="tag-cloud">${buildTagCloud(data.tagFreq)}</div>
    </div>
    <div class="summary-section">
      <h3 class="summary-section-title">Requirements</h3>
      <div id="filterBarWrap" class="filter-bar">${buildFilterBar(data)}</div>
      <div id="reqTableWrap"></div>
    </div>
    <div class="summary-export-row">
      <button id="exportSummaryBtn" class="btn">Export Summary.md</button>
    </div>
  `;

  applyDynamicStyles(panel);
  renderDepGraph(panel.querySelector('#depGraphWrap'), data);
  refreshTable(panel);
  attachListeners(panel, data);
}

/* ── Aggregation ────────────────────────────────────────────────────────── */

function aggregateDocs(docs) {
  let valid = 0;
  let withWarnings = 0;
  const users      = {};
  const priorities = {};
  const statuses   = {};
  const tagFreq    = {};
  const deps       = [];

  for (const doc of docs) {
    const fm = doc.frontmatter || {};

    if (doc.warnings && doc.warnings.length > 0) withWarnings++;
    else valid++;

    const user = fm.user || 'unknown';
    users[user] = (users[user] || 0) + 1;

    const prio = (fm.priority || 'unset').toLowerCase();
    priorities[prio] = (priorities[prio] || 0) + 1;

    const stat = (fm.status || 'unset').toLowerCase();
    statuses[stat] = (statuses[stat] || 0) + 1;

    const tags = Array.isArray(fm.tags) ? fm.tags : [];
    for (const t of tags) tagFreq[t] = (tagFreq[t] || 0) + 1;

    const rawDeps = fm.depends_on;
    const depList = Array.isArray(rawDeps) ? rawDeps : rawDeps ? [rawDeps] : [];
    for (const d of depList) {
      deps.push({ from: fm.id || '?', to: String(d) });
    }
  }

  const allIds = new Set(docs.map(d => d.frontmatter?.id).filter(Boolean));
  return { total: docs.length, valid, withWarnings, users, priorities, statuses, tagFreq, deps, allIds };
}

/* ── HTML builders ──────────────────────────────────────────────────────── */

function buildCounts(data) {
  return `
    <div class="count-chip">
      <span class="count-num">${data.total}</span>
      <span class="count-label">Files</span>
    </div>
    <div class="count-chip count-chip--ok">
      <span class="count-num">${data.valid}</span>
      <span class="count-label">Valid</span>
    </div>
    <div class="count-chip count-chip--warn">
      <span class="count-num">${data.withWarnings}</span>
      <span class="count-label">Warnings</span>
    </div>
  `;
}

function buildUserTable(data) {
  const rows = Object.entries(data.users)
    .sort((a, b) => b[1] - a[1])
    .map(([user, count]) => `<tr><td>${esc(user)}</td><td class="user-count">${count}</td></tr>`)
    .join('');
  return `
    <h3 class="summary-section-title">Users</h3>
    <table class="summary-table user-table">
      <thead><tr><th>User role</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildDistBar(title, dist, colors, order) {
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  if (total === 0) return '';

  const segments = order
    .filter(k => dist[k])
    .map(k => {
      const pct = ((dist[k] / total) * 100).toFixed(1);
      return `<div class="dist-seg" data-pct="${pct}" data-color="${colors[k] || '#9ca3af'}"
        title="${k}: ${dist[k]} (${pct}%)"></div>`;
    }).join('');

  const legend = order
    .filter(k => dist[k])
    .map(k => `<span class="dist-legend-item"><span class="dist-dot" data-color="${colors[k] || '#9ca3af'}"></span>${esc(k)} ${dist[k]}</span>`)
    .join('');

  return `
    <div class="dist-section">
      <div class="summary-section-title">${esc(title)}</div>
      <div class="dist-bar">${segments}</div>
      <div class="dist-legend">${legend}</div>
    </div>
  `;
}

function buildTagCloud(tagFreq) {
  const entries = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '<span class="summary-empty-inline">No tags found.</span>';
  const max = entries[0][1];
  const min = entries[entries.length - 1][1];
  return entries.map(([tag, count]) => {
    const scale = max === min ? 1 : (count - min) / (max - min);
    const size  = (0.8 + scale * 1.0).toFixed(2);
    return `<span class="tag-cloud-item" data-size="${size}" title="${count}">${esc(tag)}</span>`;
  }).join(' ');
}

/** Apply dynamic styles to elements that used data-* instead of style= (CSP). */
function applyDynamicStyles(root) {
  root.querySelectorAll('.dist-seg[data-pct]').forEach(el => {
    el.style.width = el.dataset.pct + '%';
    el.style.background = el.dataset.color;
  });
  root.querySelectorAll('.dist-dot[data-color]').forEach(el => {
    el.style.background = el.dataset.color;
  });
  root.querySelectorAll('.tag-cloud-item[data-size]').forEach(el => {
    el.style.fontSize = el.dataset.size + 'rem';
  });
}

function buildFilterBar(data) {
  const userOpts = Object.keys(data.users).sort().map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  const prioOpts = PRIORITY_ORDER.filter(p => data.priorities[p]).map(p => `<option value="${p}">${p}</option>`).join('');
  const statOpts = STATUS_ORDER.filter(s => data.statuses[s]).map(s => `<option value="${s}">${s}</option>`).join('');

  return `
    <select id="filterUser" class="filter-select"><option value="">All users</option>${userOpts}</select>
    <select id="filterPriority" class="filter-select"><option value="">All priorities</option>${prioOpts}</select>
    <select id="filterStatus" class="filter-select"><option value="">All statuses</option>${statOpts}</select>
    <input id="filterSearch" class="filter-input" type="text" placeholder="Search id or outcome…">
    <span id="filterCount" class="filter-count" hidden></span>
    <button id="clearFiltersBtn" class="btn btn--sm btn--ghost" hidden>Clear filters</button>
  `;
}

/* ── Requirements table ─────────────────────────────────────────────────── */

function getFilteredDocs() {
  return _allDocs.filter(doc => {
    const fm = doc.frontmatter || {};
    if (_filterState.user     && (fm.user || 'unknown') !== _filterState.user)         return false;
    if (_filterState.priority && (fm.priority || 'unset').toLowerCase() !== _filterState.priority) return false;
    if (_filterState.status   && (fm.status   || 'unset').toLowerCase() !== _filterState.status)   return false;
    if (_filterState.search) {
      const q = _filterState.search.toLowerCase();
      const id  = (fm.id || '').toLowerCase();
      const uo  = (fm.user_outcome || '').toLowerCase();
      if (!id.includes(q) && !uo.includes(q)) return false;
    }
    return true;
  });
}

function getSortedDocs(docs) {
  const col = _sortState.col;
  const dir = _sortState.dir === 'asc' ? 1 : -1;
  return [...docs].sort((a, b) => {
    const av = String((a.frontmatter || {})[col] || '').toLowerCase();
    const bv = String((b.frontmatter || {})[col] || '').toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

function refreshTable(panel) {
  const filtered = getFilteredDocs();
  const sorted   = getSortedDocs(filtered);

  // update filter count + clear button
  const activeCount = Object.values(_filterState).filter(Boolean).length;
  const countEl = panel.querySelector('#filterCount');
  const clearBtn = panel.querySelector('#clearFiltersBtn');
  if (countEl)  { countEl.textContent = `${activeCount} filter${activeCount > 1 ? 's' : ''} active`; countEl.hidden = activeCount === 0; }
  if (clearBtn) { clearBtn.hidden = activeCount === 0; }

  const wrap = panel.querySelector('#reqTableWrap');
  if (!wrap) return;

  if (sorted.length === 0) {
    wrap.innerHTML = '<p class="summary-empty-inline">No matching requirements.</p>';
    return;
  }

  const COLS = [
    { key: 'id',           label: 'ID' },
    { key: 'user',         label: 'User' },
    { key: 'priority',     label: 'Priority' },
    { key: 'status',       label: 'Status' },
    { key: 'user_outcome', label: 'Outcome' },
  ];

  const headers = COLS.map(c => {
    const active = _sortState.col === c.key;
    const arrow  = active ? (_sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="req-th${active ? ' req-th--active' : ''}" data-col="${c.key}">${c.label}${arrow}</th>`;
  }).join('');

  const rows = sorted.map(doc => {
    const fm  = doc.frontmatter || {};
    const idx = _allDocs.indexOf(doc);
    const prio = (fm.priority || 'unset').toLowerCase();
    const stat = (fm.status   || 'unset').toLowerCase();
    const cells = COLS.map(c => {
      let val = esc(String(fm[c.key] || ''));
      if (c.key === 'priority') val = `<span class="prio-badge prio-badge--${prio}">${val || 'unset'}</span>`;
      if (c.key === 'status')   val = `<span class="stat-badge stat-badge--${stat}">${val || 'unset'}</span>`;
      return `<td>${val}</td>`;
    }).join('');
    return `<tr class="req-row" data-idx="${idx}">${cells}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="req-table-scroll">
      <table class="summary-table req-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Row click to navigate
  wrap.querySelectorAll('.req-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.dataset.idx, 10);
      if (!isNaN(idx)) _onNav(idx);
    });
  });

  // Header click to sort
  wrap.querySelectorAll('.req-th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_sortState.col === col) _sortState.dir = _sortState.dir === 'asc' ? 'desc' : 'asc';
      else { _sortState.col = col; _sortState.dir = 'asc'; }
      refreshTable(panel);
    });
  });
}

/* ── Dependency graph ───────────────────────────────────────────────────── */

function renderDepGraph(container, data) {
  if (!container) return;

  const { deps, allIds } = data;
  if (deps.length === 0) {
    container.innerHTML = '<p class="summary-empty-inline">No cross-dependencies found.</p>';
    return;
  }

  // Collect unique node ids (include broken targets)
  const nodeIds = [...new Set([...allIds, ...deps.map(d => d.to)])];
  const W = 600, H = 280, PAD = 30, R = 16;

  // Initial positions: circle layout
  const nodes = nodeIds.map((id, i) => {
    const angle = (2 * Math.PI * i) / nodeIds.length;
    const cx = W / 2 + (W / 2 - PAD - R) * Math.cos(angle) * 0.8;
    const cy = H / 2 + (H / 2 - PAD - R) * Math.sin(angle) * 0.8;
    return { id, x: cx, y: cy, vx: 0, vy: 0 };
  });

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // Force simulation (100 iterations)
  const K_REP = 3500, K_SPRING = 0.05, K_CENTER = 0.01, REST = 120;
  for (let iter = 0; iter < 120; iter++) {
    // Reset forces
    nodes.forEach(n => { n.fx = 0; n.fy = 0; });

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f  = K_REP / d2;
        a.fx += f * dx; a.fy += f * dy;
        b.fx -= f * dx; b.fy -= f * dy;
      }
    }

    // Spring (edges)
    for (const dep of deps) {
      const a = nodeMap[dep.from], b = nodeMap[dep.to];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f  = K_SPRING * (d - REST);
      a.fx += f * dx / d; a.fy += f * dy / d;
      b.fx -= f * dx / d; b.fy -= f * dy / d;
    }

    // Center
    nodes.forEach(n => {
      n.fx += K_CENTER * (W / 2 - n.x);
      n.fy += K_CENTER * (H / 2 - n.y);
    });

    // Integrate + clamp
    nodes.forEach(n => {
      n.vx = (n.vx + n.fx) * 0.6;
      n.vy = (n.vy + n.fy) * 0.6;
      n.x  = Math.max(PAD + R, Math.min(W - PAD - R, n.x + n.vx));
      n.y  = Math.max(PAD + R, Math.min(H - PAD - R, n.y + n.vy));
    });
  }

  // Build SVG
  const edgeSvg = deps.map(dep => {
    const a = nodeMap[dep.from], b = nodeMap[dep.to];
    if (!a || !b) return '';
    const broken  = !allIds.has(dep.to);
    const color   = broken ? '#dc2626' : '#94a3b8';
    const strokeW = broken ? 2 : 1.5;

    // Arrow head via marker-end
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const ex  = b.x - (R + 4) * dx / len;
    const ey  = b.y - (R + 4) * dy / len;
    const sx  = a.x + R * dx / len;
    const sy  = a.y + R * dy / len;
    const mid = `${(sx + ex) / 2},${(sy + ey) / 2}`;
    return `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"
      stroke="${color}" stroke-width="${strokeW}" stroke-dasharray="${broken ? '4 3' : 'none'}"
      data-from="${esc(dep.from)}" data-to="${esc(dep.to)}" class="dep-edge"/>`;
  }).join('\n');

  const nodeSvg = nodes.map(n => {
    const broken = !allIds.has(n.id);
    const fill   = broken ? '#fee2e2' : '#eff6ff';
    const stroke = broken ? '#dc2626' : '#2f6fed';
    const idx    = _allDocs.findIndex(d => d.frontmatter?.id === n.id);
    const label  = n.id.length > 12 ? n.id.slice(0, 11) + '…' : n.id;
    return `<g class="dep-node${idx >= 0 ? ' dep-node--clickable' : ''}" data-idx="${idx}" data-id="${esc(n.id)}">
      <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${n.x.toFixed(1)}" y="${(n.y + 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${broken ? '#dc2626' : '#1e40af'}">${esc(label)}</text>
    </g>`;
  }).join('\n');

  container.innerHTML = `
    <svg class="dep-graph-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8"/>
        </marker>
        <marker id="arrow-broken" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#dc2626"/>
        </marker>
      </defs>
      ${edgeSvg}
      ${nodeSvg}
    </svg>
    ${buildDepLegend(data)}
  `;

  // Node click to navigate
  container.querySelectorAll('.dep-node--clickable').forEach(g => {
    g.addEventListener('click', () => {
      const idx = parseInt(g.dataset.idx, 10);
      if (!isNaN(idx) && idx >= 0) _onNav(idx);
    });
  });

  // Node hover to highlight edges
  container.querySelectorAll('.dep-node').forEach(g => {
    const id = g.dataset.id;
    g.addEventListener('mouseenter', () => {
      container.querySelectorAll('.dep-edge').forEach(e => {
        const connected = e.dataset.from === id || e.dataset.to === id;
        e.style.strokeWidth = connected ? '3' : '0.5';
        e.style.opacity     = connected ? '1' : '0.2';
      });
      container.querySelectorAll('.dep-node').forEach(n => {
        const nid = n.dataset.id;
        const conn = nid === id || deps.some(d => (d.from === id && d.to === nid) || (d.to === id && d.from === nid));
        n.style.opacity = conn ? '1' : '0.3';
      });
    });
    g.addEventListener('mouseleave', () => {
      container.querySelectorAll('.dep-edge').forEach(e => { e.style.strokeWidth = ''; e.style.opacity = ''; });
      container.querySelectorAll('.dep-node').forEach(n => { n.style.opacity = ''; });
    });
  });
}

function buildDepLegend(data) {
  const hasBroken = data.deps.some(d => !data.allIds.has(d.to));
  if (!hasBroken) return '';
  return `<p class="dep-legend-note">
    <span class="dep-broken-swatch"></span> Dashed red = unresolved dependency (target not loaded)
  </p>`;
}

/* ── Event listeners ────────────────────────────────────────────────────── */

function attachListeners(panel, data) {
  const apply = () => {
    _filterState.user     = panel.querySelector('#filterUser')?.value     || '';
    _filterState.priority = panel.querySelector('#filterPriority')?.value || '';
    _filterState.status   = panel.querySelector('#filterStatus')?.value   || '';
    _filterState.search   = panel.querySelector('#filterSearch')?.value   || '';
    refreshTable(panel);
  };

  panel.querySelector('#filterUser')?.addEventListener('change', apply);
  panel.querySelector('#filterPriority')?.addEventListener('change', apply);
  panel.querySelector('#filterStatus')?.addEventListener('change', apply);
  panel.querySelector('#filterSearch')?.addEventListener('input', apply);

  panel.querySelector('#clearFiltersBtn')?.addEventListener('click', () => {
    _filterState = { user: '', priority: '', status: '', search: '' };
    const fb = panel.querySelector('#filterBarWrap');
    if (fb) fb.innerHTML = buildFilterBar(data);
    attachListeners(panel, data); // re-attach after rebuild
    refreshTable(panel);
  });

  panel.querySelector('#exportSummaryBtn')?.addEventListener('click', () => {
    exportSummaryMd(data);
  });
}

/* ── Export summary as .md ──────────────────────────────────────────────── */

function exportSummaryMd(data) {
  const filtered = getFilteredDocs();
  const activeCount = Object.values(_filterState).filter(Boolean).length;
  const lines = [];

  lines.push('# FRS Summary Report');
  lines.push('');
  lines.push(`**Files loaded:** ${data.total} | **Valid:** ${data.valid} | **With warnings:** ${data.withWarnings}`);
  lines.push('');

  lines.push('## Users');
  lines.push('');
  lines.push('| User role | Count |');
  lines.push('|-----------|-------|');
  Object.entries(data.users).sort((a, b) => b[1] - a[1]).forEach(([u, c]) => {
    lines.push(`| ${u} | ${c} |`);
  });
  lines.push('');

  lines.push('## Priority Distribution');
  lines.push('');
  PRIORITY_ORDER.filter(k => data.priorities[k]).forEach(k => {
    lines.push(`- **${k}**: ${data.priorities[k]}`);
  });
  lines.push('');

  lines.push('## Status Distribution');
  lines.push('');
  STATUS_ORDER.filter(k => data.statuses[k]).forEach(k => {
    lines.push(`- **${k}**: ${data.statuses[k]}`);
  });
  lines.push('');

  const tagList = Object.entries(data.tagFreq).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} (${c})`).join(', ');
  if (tagList) {
    lines.push('## Tags');
    lines.push('');
    lines.push(tagList);
    lines.push('');
  }

  lines.push('## Requirements');
  if (activeCount > 0) lines.push(`_Filtered: ${activeCount} filter${activeCount > 1 ? 's' : ''} active — showing ${filtered.length} of ${_allDocs.length}_`);
  lines.push('');
  lines.push('| ID | User | Priority | Status | Outcome |');
  lines.push('|----|------|----------|--------|---------|');
  filtered.forEach(doc => {
    const fm = doc.frontmatter || {};
    lines.push(`| ${fm.id || ''} | ${fm.user || ''} | ${fm.priority || ''} | ${fm.status || ''} | ${(fm.user_outcome || '').replace(/\|/g, '\\|')} |`);
  });
  lines.push('');

  const md   = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'frs-summary.md';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Utils ──────────────────────────────────────────────────────────────── */

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
