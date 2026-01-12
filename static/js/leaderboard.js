// Minimal, style-agnostic leaderboard renderer from JSONL
// Expects: static/data/leaderboard.jsonl with one JSON object per line.
// Each JSON object should contain consistent keys across lines. Example keys:
// {"model":"GPT-4o","params":"?","date":"2025-01-01","EC":51.17,"ED":19.12,...}

function parseJSONL(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (e) {
      console.warn('Invalid JSONL line skipped:', line);
    }
  }
  return rows;
}

function buildTableHead(thead, columns) {
  const tr = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    tr.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(tr);
}

function buildTableBody(tbody, rows, columns, accessors) {
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      if (col === 'Link') {
        const { github, huggingface } = accessors.links(row);
        td.style.whiteSpace = 'nowrap';
        if (github) {
          const a = document.createElement('a');
          a.href = github; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.className = 'button is-small is-rounded is-dark';
          a.textContent = 'GitHub';
          td.appendChild(a);
        }
        if (github && huggingface) {
          td.appendChild(document.createTextNode(' '));
        }
        if (huggingface) {
          const a2 = document.createElement('a');
          a2.href = huggingface; a2.target = '_blank'; a2.rel = 'noopener noreferrer';
          a2.className = 'button is-small is-rounded is-link is-light';
          a2.textContent = 'HuggingFace';
          td.appendChild(a2);
        }
        if (!github && !huggingface) { td.textContent = '-'; }
      } else {
        const val = accessors[col](row);
        if (['EC','ED','QA','MC-4','ES','EE','Overall'].includes(col) && val !== '-' && val !== undefined && val !== null) {
          td.innerHTML = `<b>${val}</b>`;
          td.style.textAlign = 'center';
        } else {
          td.textContent = val === undefined || val === null || val === '' ? '-' : String(val);
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function findValue(row, candidates) {
  for (const k of candidates) {
    if (k in row) return row[k];
    const key = Object.keys(row).find(x => x.toLowerCase() === k.toLowerCase());
    if (key) return row[key];
  }
  return undefined;
}

function toNumberOrDash(v, digits = 2) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n === 'number' && !Number.isNaN(n)) {
    return digits != null ? n.toFixed(digits) : String(n);
  }
  return v ?? '-';
}

function calcWeightedScore(row) {
  const num = (x) => {
    const n = typeof x === 'string' ? Number(x) : x;
    return (typeof n === 'number' && !Number.isNaN(n)) ? n : null;
  };
  const EC = num(findValue(row, ['EC','ec']));
  const ED = num(findValue(row, ['ED','ed']))?
             num(findValue(row, ['ED','ed'])) : null;
  const QA = num(findValue(row, ['QA','qa']));
  const MC4 = num(findValue(row, ['MC-4','MC4','MC_4','mc4','mc-4']));
  const ES = num(findValue(row, ['ES','es']));
  const EE = num(findValue(row, ['EE','ee']));
  // weights - all tasks have equal weight of 1/6
  const w = 1 / 6;
  let score = 0;
  if (EC != null) { score += EC * w; }
  if (ED != null) { score += ED * w; }
  if (QA != null) { score += QA * w; }
  if (MC4 != null) { score += MC4 * w; }
  if (ES != null) { score += ES * w; }
  if (EE != null) { score += EE * w; }
  return score;
}

async function renderLeaderboard() {
  const table = document.getElementById('leaderboard-table');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  try {
    const resp = await fetch('static/data/leaderboard.jsonl', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const rows = parseJSONL(text);
    if (rows.length === 0) {
      buildTableHead(thead, ['Model', 'Info']);
      buildTableBody(tbody, [{ Model: 'No data', Info: '-' }], ['Model', 'Info'], {
        Model: (r) => r.Model,
        Info: (r) => r.Info,
        links: () => ({})
      });
      return;
    }

    // Fixed columns per requirement + Rank column like the reference format
    const columns = ['Rank', 'Team', 'Model', 'EC', 'ED', 'QA', 'MC-4', 'ES', 'EE', 'Overall', 'Submission Time', 'Link'];

    // Accessors map flexible keys to target columns
    const accessors = {
      'Rank': () => '',
      'Team': (r) => findValue(r, ['team', 'team_name', 'Team', 'TeamName']),
      'Model': (r) => findValue(r, ['model', 'model_name', 'name', 'Model', 'Name']),
      'EC': (r) => toNumberOrDash(findValue(r, ['EC', 'ec'])),
      'ED': (r) => toNumberOrDash(findValue(r, ['ED', 'ed'])),
      'QA': (r) => toNumberOrDash(findValue(r, ['QA', 'qa'])),
      'MC-4': (r) => {
        const v = findValue(r, ['MC-4', 'MC4', 'MC_4', 'mc4', 'mc-4']);
        return toNumberOrDash(v);
      },
      'ES': (r) => toNumberOrDash(findValue(r, ['ES', 'es'])),
      'EE': (r) => toNumberOrDash(findValue(r, ['EE', 'ee'])),
      'Overall': (r) => toNumberOrDash(findValue(r, ['Overall', 'overall', 'Overall Score', 'overall_score', 'score', 'Score'])),
      'Submission Time': (r) => {
        const raw = findValue(r, ['submission_time', 'SubmissionTime', 'date', 'Date', 'updated', 'update_date', 'updated_at']);
        if (!raw) return '-';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return String(raw);
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `${y}-${m}-${day} ${hh}:${mm}`;
      },
      'Link': () => null, // handled specially in buildTableBody
      links: (r) => {
        let gh = findValue(r, ['github', 'GitHub', 'code', 'repo']);
        let hf = findValue(r, ['huggingface', 'HuggingFace', 'hf', 'dataset']);
        // Best-effort normalization
        const norm = (url) => {
          if (!url) return '';
          if (/^https?:\/\//i.test(url)) return url;
          return 'https://' + url;
        };
        gh = norm(gh);
        hf = norm(hf);
        return { github: gh || null, huggingface: hf || null };
      }
    };

    // Sort by overall score desc if available
    const sorted = [...rows].sort((a, b) => {
      const getOverall = (r) => {
        const v = findValue(r, ['Overall', 'overall', 'Overall Score', 'overall_score', 'score', 'Score']);
        const n = typeof v === 'string' ? Number(v) : v;
        return (typeof n === 'number' && !Number.isNaN(n)) ? n : -Infinity;
      };
      const va = getOverall(a);
      const vb = getOverall(b);
      return vb - va;
    });

    // Build head and body, then fill Rank
    buildTableHead(thead, columns);
    buildTableBody(tbody, sorted, columns, accessors);
    // Fill rank numbers
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, idx) => {
      const cells = tr.children;
      // Rank
      if (cells[0]) {
        cells[0].innerHTML = `<span class="tag is-info is-light">${idx + 1}</span>`;
        cells[0].style.textAlign = 'center';
      }
      // Team/Team Name bold
      if (cells[1]) {
        cells[1].classList.add('has-text-weight-bold');
      }
      // MC-4 & ES highlight
      const mc4Idx = columns.indexOf('MC-4');
      const esIdx = columns.indexOf('ES');
      if (mc4Idx >= 0 && cells[mc4Idx]) {
        cells[mc4Idx].style.backgroundColor = '#f0f8ff';
        cells[mc4Idx].title = 'Original 5-point score (×20 in calculation)';
      }
      if (esIdx >= 0 && cells[esIdx]) {
        cells[esIdx].style.backgroundColor = '#f0f8ff';
        cells[esIdx].title = 'Original 5-point score (×20 in calculation)';
      }
      // Overall styling
      const overallIdx = columns.indexOf('Overall');
      if (overallIdx >= 0 && cells[overallIdx]) {
        cells[overallIdx].classList.add('has-text-weight-bold', 'has-text-centered');
        cells[overallIdx].style.fontSize = '1.1em';
        cells[overallIdx].style.color = '#3273dc';
        cells[overallIdx].style.backgroundColor = '#f0f8ff';
      }
    });
  } catch (err) {
    console.error('Failed to render leaderboard:', err);
    buildTableHead(thead, ['Model', 'Info']);
    buildTableBody(tbody, [{ Model: 'Load failed', Info: String(err) }], ['Model', 'Info'], {
      Model: (r) => r.Model,
      Info: (r) => r.Info,
      links: () => ({})
    });
  }
}

document.addEventListener('DOMContentLoaded', renderLeaderboard);


