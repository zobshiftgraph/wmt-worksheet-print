(async function () {
  if (window.__wmtPPRunning) return;
  window.__wmtPPRunning = true;

  var ROOT_ID = 'wmt-pp-root';
  var STYLE_ID = 'wmt-pp-style';
  var INDEX_RE = /\/Views\/WorksheetView\/Index\/(\d+)/i;
  var REQ_HEADERS = ['CPC', 'TYPE', 'FROM', 'TO', 'WITH', 'STATUS', 'INI', 'DATE'];

  function $(id, root) {
    return (root || document).getElementById(id);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function parseDateToken(text) {
    if (!text) return null;
    var s = String(text);
    var full = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (full) return pad(full[1]) + '/' + pad(full[2]) + '/' + full[3];
    var named = Date.parse(s.replace(/^\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s*/i, ''));
    if (!isNaN(named)) {
      var d = new Date(named);
      return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear();
    }
    return null;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function currentDayNum() {
    var m = location.pathname.match(INDEX_RE);
    return m ? Number(m[1]) : null;
  }

  function indexHref(dayNum) {
    var m = location.pathname.match(/^(.*\/Views\/WorksheetView\/Index)(?:\/\d+)?\/?$/i);
    var origin = location.origin;
    if (m) return origin + m[1] + '/' + dayNum;
    return origin + '/Views/WorksheetView/Index/' + dayNum;
  }

  function collectDays() {
    var days = [];
    var seen = {};
    var strip = $('WorksheetViewDayStrip') || document;
    var links = strip.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var raw = a.getAttribute('href') || '';
      if (raw.indexOf('#') !== -1 || /help\/detail/i.test(raw)) continue;
      var m = (raw || a.href || '').match(INDEX_RE);
      if (!m) continue;
      var dayNum = Number(m[1]);
      if (seen[dayNum]) continue;
      seen[dayNum] = true;
      var td = a.closest('td');
      var label = ((td && td.textContent) || a.textContent || '').replace(/\s+/g, ' ').trim();
      days.push({
        dayNum: dayNum,
        date: parseDateToken(label),
        href: a.href || indexHref(dayNum),
        label: label
      });
    }
    days.sort(function (a, b) { return a.dayNum - b.dayNum; });
    if (!days.length) {
      var n = currentDayNum();
      if (n) {
        for (var d = 1; d <= 14; d++) {
          days.push({
            dayNum: d,
            date: null,
            href: indexHref(d),
            label: 'Day ' + d
          });
        }
      }
    }
    return days;
  }

  function cleanNode(node) {
    if (!node) return null;
    var clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, iframe, img, input, select, textarea, button').forEach(function (el) {
      el.remove();
    });
    clone.querySelectorAll('a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      var text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (
        href.indexOf('javascript:') === 0 ||
        /click here for ot list/i.test(text) ||
        /^<?add(\s|&nbsp;)*shift notes>?$/i.test(text) ||
        /^(edit|save|cancel|add)$/i.test(text)
      ) {
        a.remove();
        return;
      }
      var span = document.createElement('span');
      span.textContent = text;
      a.parentNode.replaceChild(span, a);
    });
    return clone;
  }

  function tableHasData(tbl) {
    if (!tbl) return false;
    var text = (tbl.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8) return false;
    if (/^initials\b/i.test(text) && tbl.querySelectorAll('tr').length < 3) return false;
    return tbl.querySelectorAll('tr').length > 0;
  }

  function extractArea(doc) {
    var named = $('lblAreaName', doc);
    if (named && named.textContent.trim()) return named.textContent.trim();
    var selected = doc.querySelector('#AreaId option[selected], select[name=AreaId] option[selected]');
    if (selected) return selected.textContent.trim();
    return '';
  }

  function extractPayPeriod(doc) {
    var hidden = (doc || document).querySelector('input#PayPeriodId, #PayPeriodId');
    if (hidden && hidden.value) return hidden.value;
    var opt = (doc || document).querySelector('#formWorksheetViewFilterDropDown option[selected]');
    return opt ? opt.value : '';
  }

  function uniqNames(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (n) {
      var raw = String(n || '').replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim();
      if (!raw || /^(edit|save|cancel|add)$/i.test(raw)) return;
      var key = raw.toUpperCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(raw);
    });
    return out;
  }

  function peopleFrom(cell) {
    if (!cell) return [];
    var names = [];
    cell.querySelectorAll('a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (href.indexOf('javascript:') === 0 || /overtimelist/i.test(href)) return;
      var t = a.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim();
      if (t) names.push(t);
    });
    cell.querySelectorAll('span, div').forEach(function (el) {
      if (el.querySelector('a')) return;
      var t = el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, '').trim();
      if (t && t.length <= 8) names.push(t);
    });
    if (!names.length) {
      var text = cell.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (text && !/^shift$/i.test(text)) {
        text.split(/[\s,;/]+/).forEach(function (p) {
          if (p && !/^(of|-)$/i.test(p)) names.push(p);
        });
      }
    }
    return uniqNames(names);
  }

  function parseShiftTable(tbl) {
    var rows = [];
    if (!tbl) return rows;
    var trs = tbl.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      var tds = trs[i].children;
      if (tds.length < 3) continue;
      var code = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
      if (!code || /^shift$/i.test(code)) continue;
      var totCell = tds[4] || null;
      rows.push({
        code: code,
        sup: peopleFrom(tds[1]),
        cpc: peopleFrom(tds[2]),
        dev: tds[3] ? peopleFrom(tds[3]) : [],
        tot: totCell ? (totCell.textContent || '').replace(/\s+/g, ' ').trim() : '',
        totBg: totCell && totCell.style ? totCell.style.backgroundColor : ''
      });
    }
    return rows;
  }

  function parseRequestTable(tbl) {
    var rows = [];
    if (!tbl) return rows;
    var trs = tbl.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      var tds = trs[i].querySelectorAll('td');
      if (tds.length < 2) continue;
      var cells = [];
      var colCount = tds.length > 8 ? tds.length : 8;
      for (var c = 0; c < colCount; c++) {
        var t = tds[c] ? (tds[c].textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
        t = t.replace(/\b(Edit|Save|Cancel)\b/g, '').replace(/\s+/g, ' ').trim();
        cells.push(t);
      }
      var joined = cells.join('').toUpperCase();
      if (!joined) continue;
      if (/^(CPC|INITIALS|INI|SHIFT|TYPE)(TYPE|LVTYPE)?$/.test((cells[0] || '').toUpperCase())) continue;
      if (joined.indexOf('CPC') === 0 && joined.indexOf('TYPE') !== -1 && i === 0) continue;
      rows.push(cells.slice(0, 8));
    }
    return rows;
  }

  function parseInnerRows(tbl) {
    var inner = tbl && (tbl.querySelector('table table') || tbl.querySelector('table') || tbl);
    return parseRequestTable(inner);
  }

  function parseRdoNames(tbl) {
    if (!tbl) return [];
    return peopleFrom(tbl);
  }

  function parseNotes(tbl) {
    if (!tbl) return '';
    var clone = tbl.cloneNode(true);
    clone.querySelectorAll('a, input, button').forEach(function (el) { el.remove(); });
    return (clone.textContent || '').replace(/\s+/g, ' ').replace(/<Add Shift Notes>/gi, '').trim();
  }

  function mergeRowLists(a, b) {
    var seen = {};
    var out = [];
    function add(rows) {
      (rows || []).forEach(function (r) {
        var key = (r || []).join('|').toUpperCase();
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(r);
      });
    }
    add(a);
    add(b);
    return out;
  }

  function shiftSortKey(code) {
    var m = String(code || '').match(/(\d{4})/);
    if (!m) return 90000;
    var t = parseInt(m[1], 10);
    if (t >= 1900) return t;
    return t + 2400;
  }

  function mergeShifts(areaRows, osRows) {
    var map = {};
    var areaOrder = [];
    (areaRows || []).forEach(function (row) {
      var key = String(row.code || '').toUpperCase();
      if (!map[key]) {
        map[key] = {
          code: row.code,
          sup: (row.sup || []).slice(),
          cpc: (row.cpc || []).slice(),
          dev: (row.dev || []).slice(),
          tot: row.tot,
          totBg: row.totBg
        };
        areaOrder.push(key);
      }
    });
    var extra = [];
    (osRows || []).forEach(function (row) {
      var osPeople = uniqNames([].concat(row.sup, row.cpc, row.dev));
      if (!osPeople.length) return;
      var key = String(row.code || '').toUpperCase();
      if (map[key]) {
        map[key].sup = uniqNames(map[key].sup.concat(osPeople));
        return;
      }
      map[key] = {
        code: row.code,
        sup: osPeople,
        cpc: [],
        dev: [],
        tot: row.tot,
        totBg: row.totBg
      };
      extra.push(key);
    });
    extra.sort(function (a, b) {
      var d = shiftSortKey(map[a].code) - shiftSortKey(map[b].code);
      return d || a.localeCompare(b);
    });
    extra.forEach(function (key) {
      var k = shiftSortKey(map[key].code);
      var inserted = false;
      for (var i = 0; i < areaOrder.length; i++) {
        var ak = shiftSortKey(map[areaOrder[i]].code);
        if (k < ak || (k === ak && key.localeCompare(areaOrder[i]) < 0)) {
          areaOrder.splice(i, 0, key);
          inserted = true;
          break;
        }
      }
      if (!inserted) areaOrder.push(key);
    });
    return areaOrder.map(function (k) { return map[k]; });
  }

  function mergeDays(area, os) {
    if (!os || !os.ok) return area;
    if (!area || !area.ok) return os;
    return {
      dateText: area.dateText || os.dateText,
      date: area.date || os.date,
      area: [area.area, os.area].filter(Boolean).join(' + '),
      facility: area.facility || os.facility,
      payPeriod: area.payPeriod || os.payPeriod,
      shifts: mergeShifts(area.shifts, os.shifts),
      requests: mergeRowLists(area.requests, os.requests),
      xte: mergeRowLists(area.xte, os.xte),
      supReq: mergeRowLists(area.supReq, os.supReq),
      ot: mergeRowLists(area.ot, os.ot),
      detail: mergeRowLists(area.detail, os.detail),
      rdo: uniqNames([].concat(area.rdo || [], os.rdo || [])),
      notes: [area.notes, os.notes].filter(Boolean).join(' | '),
      ok: !!(area.ok || os.ok)
    };
  }

  function extractDay(doc) {
    var dateEl = $('lblSelectedDate', doc);
    var dateText = dateEl ? dateEl.textContent.trim() : '';
    function safe(fn, fallback) {
      try { return fn(); } catch (e1) { return fallback; }
    }
    return {
      dateText: dateText,
      date: parseDateToken(dateText) || parseDateToken(doc.body && doc.body.innerText),
      area: extractArea(doc),
      facility: ($('lblHeaderFacilityName', doc) && $('lblHeaderFacilityName', doc).textContent.trim()) || 'ZOB',
      payPeriod: extractPayPeriod(doc),
      shifts: safe(function () { return parseShiftTable($('ScheduledShifts', doc)); }, []),
      requests: safe(function () { return parseRequestTable($('tblShiftChange', doc)); }, []),
      xte: safe(function () { return parseRequestTable($('tblXTECTE', doc)); }, []),
      supReq: safe(function () { return parseRequestTable($('tblSupRequests', doc)); }, []),
      ot: safe(function () { return parseInnerRows($('ControllersOnOTShifts', doc)); }, []),
      detail: safe(function () { return parseInnerRows($('ControllersOnDetailShifts', doc)); }, []),
      rdo: safe(function () { return parseRdoNames($('ControllersOnRDO', doc)); }, []),
      notes: safe(function () { return parseNotes($('ShiftNotesForDay', doc)); }, ''),
      ok: !!$('ScheduledShifts', doc)
    };
  }

  function dayLooksRight(extracted, day) {
    if (!extracted || !extracted.ok) return false;
    if (!day.date || !extracted.date) return true;
    return extracted.date === day.date;
  }

  async function fetchHtml(url) {
    var res = await fetch(url, { credentials: 'same-origin', redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  function loadViaIframe(url) {
    return new Promise(function (resolve, reject) {
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-12000px;top:0;opacity:0;pointer-events:none';
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        iframe.remove();
        reject(new Error('Timed out loading ' + url));
      }, 20000);
      iframe.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          var doc = iframe.contentDocument;
          if (!doc) throw new Error('Could not read loaded page');
          var extracted = extractDay(doc);
          iframe.remove();
          resolve(extracted);
        } catch (err) {
          iframe.remove();
          reject(err);
        }
      };
      iframe.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        iframe.remove();
        reject(new Error('Iframe failed'));
      };
      document.body.appendChild(iframe);
      iframe.src = url;
    });
  }

  function areaSelect(doc) {
    var form = (doc || document).getElementById('formWorksheetViewFilterDropDown');
    if (form) return form.querySelector('select[name="AreaId"]');
    return (doc || document).querySelector('#formWorksheetViewFilterDropDown select[name="AreaId"], select[name="AreaId"]');
  }

  function currentAreaInfo(doc) {
    var sel = areaSelect(doc);
    if (!sel || sel.selectedIndex < 0) {
      var named = extractArea(doc || document);
      return named ? { id: '', name: named } : null;
    }
    var opt = sel.options[sel.selectedIndex];
    return { id: opt.value, name: String(opt.textContent || '').replace(/\s+/g, ' ').trim() };
  }

  function findPairedArea(doc) {
    var sel = areaSelect(doc);
    var cur = currentAreaInfo(doc);
    if (!sel || !cur || !cur.name) return null;
    var want = /\sOS$/i.test(cur.name)
      ? cur.name.replace(/\sOS$/i, '').trim()
      : cur.name + ' OS';
    for (var i = 0; i < sel.options.length; i++) {
      var name = String(sel.options[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (name.toUpperCase() === want.toUpperCase() && sel.options[i].value !== cur.id) {
        return { id: sel.options[i].value, name: name };
      }
    }
    return null;
  }

  function formAction(form) {
    var action = (form && (form.getAttribute('action') || form.action)) || '/Views/WorksheetView/SelectWorksheetView';
    try { return new URL(action, location.href).href; } catch (e) { return action; }
  }

  async function selectArea(areaId, fromDoc) {
    var doc = fromDoc || document;
    var form = doc.getElementById('formWorksheetViewFilterDropDown') || doc.querySelector('form[action*="SelectWorksheetView"]');
    var params = new URLSearchParams();
    if (form) {
      var data = new FormData(form);
      data.forEach(function (value, key) {
        if (typeof value === 'string') params.append(key, value);
      });
    }
    params.set('AreaId', String(areaId));
    var pp = doc.querySelector('select[name="PayPeriodId"]') || doc.querySelector('input[name="PayPeriodId"]');
    if (pp && pp.value) params.set('PayPeriodId', pp.value);
    var res = await fetch(formAction(form), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Area switch HTTP ' + res.status);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  function areaMatches(extracted, expectedName) {
    if (!expectedName || !extracted || !extracted.area) return true;
    return extracted.area.replace(/\s+/g, ' ').trim().toUpperCase() === expectedName.toUpperCase();
  }

  async function loadDay(day, liveDayNum) {
    if (liveDayNum && day.dayNum === liveDayNum) return extractDay(document);
    var url = day.href || indexHref(day.dayNum);
    var html = await fetchHtml(url);
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var extracted = extractDay(doc);
    if (dayLooksRight(extracted, day)) return extracted;
    var framed = await loadViaIframe(url);
    if (dayLooksRight(framed, day)) return framed;
    return framed.ok ? framed : extracted;
  }

  async function loadAreaDays(days, liveDayNum, expectedArea, labelPrefix) {
    var results = [];
    for (var i = 0; i < days.length; i++) {
      var day = days[i];
      setStatus((labelPrefix ? labelPrefix + ' — ' : '') + 'Loading ' + (i + 1) + ' of ' + days.length + ' — ' + (day.label || ('Index/' + day.dayNum)));
      try {
        var extracted = await loadDay(day, liveDayNum);
        if (expectedArea && extracted.ok && !areaMatches(extracted, expectedArea)) {
          extracted.area = extracted.area || expectedArea;
        }
        results.push(extracted);
      } catch (err) {
        results.push({
          dateText: day.label || day.date,
          date: day.date,
          facility: '',
          area: expectedArea || '',
          payPeriod: '',
          sections: [],
          ok: false
        });
      }
      if (i < days.length - 1) await sleep(280);
    }
    return results;
  }

  function cssText() {
    return [
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:2147483646;background:#f4f1ea;color:#111;overflow:auto;font-family:Arial,Helvetica,sans-serif}',
      '#' + ROOT_ID + ' *{box-sizing:border-box}',
      '#' + ROOT_ID + ' .wmt-pp-bar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px;background:#f7f4ec !important;color:#111 !important;border-bottom:2px solid #1e3a5f;box-shadow:0 2px 8px rgba(0,0,0,.12)}',
      '#' + ROOT_ID + ' .wmt-pp-bar b,#' + ROOT_ID + ' .wmt-pp-bar span,#' + ROOT_ID + ' .wmt-pp-bar div{color:#111 !important}',
      '#' + ROOT_ID + ' .wmt-pp-bar b{font-size:15px;font-weight:700}',
      '#' + ROOT_ID + ' .wmt-pp-bar span{font-size:13px}',
      '#' + ROOT_ID + ' .wmt-pp-actions{display:flex;gap:8px}',
      '#' + ROOT_ID + ' .wmt-pp-btn{border-radius:6px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer}',
      '#' + ROOT_ID + ' .wmt-pp-btn.print{background:#1e3a5f !important;color:#fff !important;border:1px solid #1e3a5f !important}',
      '#' + ROOT_ID + ' .wmt-pp-btn.close{background:#fff !important;color:#111 !important;border:1px solid #333 !important}',
      '#' + ROOT_ID + ' .wmt-pp-status{padding:10px 16px;background:#fff3cd;color:#5c4800;font-size:13px}',
      '#' + ROOT_ID + ' .wmt-pp-pages{padding:16px 18px 36px;max-width:1100px;margin:0 auto}',
      '#' + ROOT_ID + ' .wmt-pp-day{background:#fff;border:1px solid #cfc8b8;padding:14px 16px 18px;margin:0 0 18px}',
      '#' + ROOT_ID + ' .wmt-pp-day h1{font-size:20px;margin:0 0 4px;color:#111}',
      '#' + ROOT_ID + ' .wmt-pp-day .meta{font-size:13px;color:#333;margin-bottom:10px}',
      '#' + ROOT_ID + ' .wmt-pp-day h2{font-size:13px;margin:10px 0 4px;border-bottom:2px solid #1e3a5f;padding-bottom:2px;color:#111}',
      '#' + ROOT_ID + ' .wmt-pp-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px;align-items:start}',
      '#' + ROOT_ID + ' .wmt-pp-day table{border-collapse:collapse;width:100%;font-size:12px;margin:0 0 8px;color:#111}',
      '#' + ROOT_ID + ' .wmt-pp-day td,#' + ROOT_ID + ' .wmt-pp-day th{border:1px solid #444;padding:4px 7px;vertical-align:middle;text-align:left;color:#111;line-height:1.35}',
      '#' + ROOT_ID + ' .wmt-pp-day th{background:#1e3a5f;color:#fff !important;font-weight:700}',
      '#' + ROOT_ID + ' .wmt-pp-day tbody tr:nth-child(even) td{background:#f3f6fa}',
      '#' + ROOT_ID + ' .wmt-pp-day td:first-child{font-weight:700;white-space:nowrap}',
      '#' + ROOT_ID + ' .wmt-pp-line{font-size:12px;margin:6px 0 4px;line-height:1.4}',
      '#' + ROOT_ID + ' .wmt-pp-requests h2{font-size:12px;margin:8px 0 3px}',
      '#' + ROOT_ID + ' .wmt-pp-requests table{font-size:10px}',
      '#' + ROOT_ID + ' .wmt-pp-requests td,#' + ROOT_ID + ' .wmt-pp-requests th{padding:2px 4px;line-height:1.2;font-weight:400;white-space:normal}'
    ].join('');
  }

  function printDocCss() {
    return 'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}' +
      '.wmt-pp-day{break-after:page;page-break-after:always;padding:0;color:#111}' +
      '.wmt-pp-day:last-child{break-after:auto;page-break-after:auto}' +
      'h1{font-size:16pt;margin:0 0 2px;color:#111}' +
      '.meta{font-size:10pt;color:#333;margin:0 0 8px}' +
      'h2{font-size:11pt;margin:8px 0 3px;border-bottom:2px solid #1e3a5f;padding-bottom:2px;color:#111}' +
      '.wmt-pp-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:10px;align-items:start}' +
      'table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:0 0 6px;color:#111}' +
      'td,th{border:1px solid #333;padding:3px 6px;vertical-align:middle;text-align:left;color:#111;line-height:1.3}' +
      'th{background:#1e3a5f;color:#fff;font-weight:700}' +
      'tbody tr:nth-child(even) td{background:#f3f6fa}' +
      'td:first-child{font-weight:700;white-space:nowrap}' +
      '.wmt-pp-line{font-size:10pt;margin:6px 0 3px;line-height:1.35}' +
      '.wmt-pp-empty{color:#444;font-style:italic;font-size:10pt}' +
      '.wmt-pp-requests h2{font-size:9pt;margin:4px 0 2px}' +
      '.wmt-pp-requests table{font-size:7.5pt}' +
      '.wmt-pp-requests td,.wmt-pp-requests th{padding:1px 3px;line-height:1.15;font-weight:400;white-space:normal}' +
      '@page{size:letter portrait;margin:.4in}';
  }

  function fitPrintDays(doc) {
    var probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;height:10in;width:1px';
    doc.body.appendChild(probe);
    var max = probe.offsetHeight;
    doc.body.removeChild(probe);
    if (!max) return;
    var days = doc.querySelectorAll('.wmt-pp-day');
    for (var i = 0; i < days.length; i++) {
      var day = days[i];
      day.style.zoom = '1';
      var h = day.scrollHeight;
      if (h > max) {
        var z = max / h;
        if (z < 0.62) z = 0.62;
        day.style.zoom = String(Math.round(z * 1000) / 1000);
      }
    }
  }

  function openPrintWindow() {
    var pages = $('wmt-pp-pages');
    if (!pages || !pages.children.length) {
      alert('Nothing to print yet. Wait for the days to finish loading, then click Print.');
      return;
    }
    var title = (document.title || 'WMT Worksheet').replace(/[<>]/g, '');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title +
      '</title><style>' + printDocCss() + '</style></head><body>' + pages.innerHTML + '</body></html>';
    var w = window.open('', '_blank');
    if (!w) {
      alert('The browser blocked the print window.\n\nAllow pop-ups for wmtscheduler.faa.gov, then click Print again.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () {
      try { fitPrintDays(w.document); } catch (e0) {}
      setTimeout(function () {
        try { w.print(); } catch (e1) {}
      }, 150);
    }, 350);
  }

  function ensureUi() {
    var old = $(ROOT_ID);
    if (old) old.remove();
    var oldStyle = $(STYLE_ID);
    if (oldStyle) oldStyle.remove();

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = cssText();
    document.documentElement.appendChild(style);

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<div class="wmt-pp-bar" style="background:#f7f4ec;color:#111"><div><b style="color:#111">WMT pay period printer</b><br><span id="wmt-pp-summary" style="color:#111">Starting…</span></div><div class="wmt-pp-actions"><button class="wmt-pp-btn print" id="wmt-pp-print" type="button" style="background:#1e3a5f;color:#fff;border:1px solid #1e3a5f">Print</button><button class="wmt-pp-btn close" id="wmt-pp-close" type="button" style="background:#fff;color:#111;border:1px solid #333">Close</button></div></div><div class="wmt-pp-status" id="wmt-pp-status" style="color:#5c4800">Looking for pay-period dates…</div><div class="wmt-pp-pages" id="wmt-pp-pages"></div>';
    document.body.appendChild(root);

    function bind(el, fn) {
      if (!el) return;
      var handler = function (ev) {
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        fn();
      };
      el.addEventListener('click', handler, true);
      el.onclick = handler;
    }
    bind($('wmt-pp-close'), function () {
      root.remove();
      style.remove();
      window.__wmtPPRunning = false;
    });
    bind($('wmt-pp-print'), openPrintWindow);
    document.addEventListener('keydown', function onEsc(ev) {
      if (ev.key === 'Escape' && $(ROOT_ID)) {
        $('wmt-pp-close').click();
        document.removeEventListener('keydown', onEsc);
      }
    });
    return root;
  }

  function setStatus(msg) {
    var el = $('wmt-pp-status');
    if (el) el.textContent = msg;
  }

  function addHeading(parent, text) {
    var h = document.createElement('h2');
    h.textContent = text;
    parent.appendChild(h);
  }

  function addLine(parent, label, text) {
    if (!text) return;
    var d = document.createElement('div');
    d.className = 'wmt-pp-line';
    d.textContent = label + ': ' + text;
    parent.appendChild(d);
  }

  function buildTable(headers, rows) {
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    headers.forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement('tbody');
    (rows || []).forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (cell) {
        var td = document.createElement('td');
        if (cell && typeof cell === 'object') {
          td.textContent = cell.text || '';
          if (cell.bg) td.style.backgroundColor = cell.bg;
        } else {
          td.textContent = cell || '';
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    return table;
  }

  function renderDay(page, extracted, fallbackLabel) {
    var sec = document.createElement('section');
    sec.className = 'wmt-pp-day';
    var h1 = document.createElement('h1');
    h1.textContent = extracted.dateText || fallbackLabel || 'Worksheet';
    sec.appendChild(h1);
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [extracted.facility, extracted.area, extracted.payPeriod ? ('PP ' + extracted.payPeriod) : ''].filter(Boolean).join(' · ');
    sec.appendChild(meta);

    var grid = document.createElement('div');
    grid.className = 'wmt-pp-grid';
    var left = document.createElement('div');
    var right = document.createElement('div');
    right.className = 'wmt-pp-requests';

    addHeading(left, 'Scheduled shifts');
    var shifts = extracted.shifts || [];
    if (!shifts.length) {
      var empty = document.createElement('div');
      empty.className = 'wmt-pp-empty';
      empty.textContent = 'No shift table found for this day.';
      left.appendChild(empty);
    } else {
      left.appendChild(buildTable(
        ['Shift', 'Sup', 'CPC', 'Dev', 'TOT'],
        shifts.map(function (r) {
          return [
            r.code,
            (r.sup || []).join(', '),
            (r.cpc || []).join(', '),
            (r.dev || []).join(', '),
            { text: r.tot || '', bg: r.totBg || '' }
          ];
        })
      ));
    }
    if (extracted.ot && extracted.ot.length) {
      addHeading(left, 'OT');
      left.appendChild(buildTable(['Ini', 'Type', 'Hrs', 'Reason', 'By'], extracted.ot.map(function (r) {
        return r.slice(0, 5);
      })));
    }
    if (extracted.detail && extracted.detail.length) {
      addHeading(left, 'Detail');
      left.appendChild(buildTable(['Ini', 'Shift', 'Work type'], extracted.detail.map(function (r) {
        return r.slice(0, 3);
      })));
    }
    addLine(left, 'RDO', (extracted.rdo || []).join(', '));
    addLine(left, 'Notes', extracted.notes || '');

    var reqs = mergeRowLists(extracted.requests, mergeRowLists(extracted.xte, extracted.supReq));
    addHeading(right, 'Requests');
    if (!reqs.length) {
      var none = document.createElement('div');
      none.className = 'wmt-pp-empty';
      none.textContent = 'None';
      right.appendChild(none);
    } else {
      right.appendChild(buildTable(REQ_HEADERS, reqs));
    }

    grid.appendChild(left);
    grid.appendChild(right);
    sec.appendChild(grid);
    page.appendChild(sec);
  }

  try {
    if ($('tblEditGrid') && !$('lblSelectedDate')) {
      alert('This looks like Edit Schedule.\n\nOpen Views → Work Sheet View, click any date in the pay period, then use this bookmark again.');
      window.__wmtPPRunning = false;
      return;
    }
    if (!$('lblSelectedDate') && !$('ScheduledShifts') && !$('WorksheetViewDayStrip')) {
      alert('Open WMT Worksheet View first (Views → Work Sheet View), then click this bookmark.');
      window.__wmtPPRunning = false;
      return;
    }

    ensureUi();
    var days = collectDays();
    var currentNum = currentDayNum();
    var homeArea = currentAreaInfo(document);
    var pair = findPairedArea(document);
    $('wmt-pp-summary').textContent = days.length
      ? ('Found ' + days.length + ' days' + (pair ? (' + ' + pair.name) : ''))
      : 'No date strip found';

    if (!days.length) {
      setStatus('Could not find the pay-period date row (WorksheetViewDayStrip).');
      window.__wmtPPRunning = false;
      return;
    }

    var pages = $('wmt-pp-pages');
    var primary = await loadAreaDays(days, currentNum, homeArea && homeArea.name, homeArea && homeArea.name);
    var secondary = [];
    var pairNote = '';
    var switchedDoc = null;

    if (pair && pair.id) {
      try {
        setStatus('Switching to ' + pair.name + '…');
        switchedDoc = await selectArea(pair.id, document);
        var switchedName = extractArea(switchedDoc);
        if (switchedName && !areaMatches({ area: switchedName }, pair.name)) {
          pairNote = ' Could not switch to ' + pair.name + ' (still ' + switchedName + ').';
        } else {
          secondary = await loadAreaDays(days, null, pair.name, pair.name);
        }
      } catch (err) {
        pairNote = ' Could not load ' + pair.name + ': ' + (err && err.message ? err.message : err);
      }
      try {
        if (homeArea && homeArea.id) {
          setStatus('Switching back to ' + homeArea.name + '…');
          await selectArea(homeArea.id, switchedDoc || document);
        }
        if (currentNum) await fetchHtml(indexHref(currentNum));
      } catch (restoreErr) {}
    }

    var okCount = 0;
    var failCount = 0;
    var uniqueDates = {};
    function tally(extracted) {
      if (!extracted) return;
      if (extracted.ok) okCount++;
      else failCount++;
      if (extracted.date) uniqueDates[extracted.date] = true;
    }
    for (var i = 0; i < days.length; i++) {
      var merged = secondary[i] ? mergeDays(primary[i], secondary[i]) : primary[i];
      renderDay(pages, merged, days[i].label || days[i].date);
      tally(merged);
    }

    var first = days[0].date || ('day-' + days[0].dayNum);
    var last = days[days.length - 1].date || ('day-' + days[days.length - 1].dayNum);
    var pp = extractPayPeriod(document);
    document.title = 'WMT Worksheet' + (pp ? (' PP ' + pp) : '') + ' ' + String(first).replace(/\//g, '-') + ' to ' + String(last).replace(/\//g, '-');
    var uniq = Object.keys(uniqueDates).length;
    var warn = uniq && uniq < days.length
      ? ' Warning: only ' + uniq + ' distinct dates came back. If this still looks like one day repeated, tell me and we will switch load method.'
      : '';
    var pairSummary = secondary.length
      ? ((homeArea && homeArea.name ? homeArea.name : 'Area') + ' with OS merged into Sup, ' + days.length + ' pages. ')
      : '';
    setStatus(okCount
      ? ('Ready — ' + pairSummary + okCount + ' sheet' + (okCount === 1 ? '' : 's') + ' loaded' + (failCount ? (', ' + failCount + ' incomplete') : '') + '. Click Print.' + pairNote + warn)
      : ('Loaded pages, but no shift tables were found.' + pairNote));
  } catch (err) {
    alert('Pay period printer error: ' + (err && err.message ? err.message : err));
    window.__wmtPPRunning = false;
  }
})();
