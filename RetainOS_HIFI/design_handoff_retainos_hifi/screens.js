/* ===========================================================================
   RetainOS — screens + tiny hash router (vanilla; structured for a React port)
   Each screen() returns an HTML string. Placeholders kept as {Token} per brief.
   =========================================================================== */
(function () {
  const content = document.getElementById('content');
  const nav = document.getElementById('nav');
  const topTitle = document.getElementById('topbar-title');

  /* ---------- shared bits ---------- */
  const ph = (t) => `<span class="ph-token">{${t}}</span>`;
  const chart = (label, h) =>
    `<div class="chart-ph" style="height:${h}px"><span class="lbl">▢ ${label}</span></div>`;

  /* ---------- DASHBOARD ---------- */
  function dashboard() {
    const kpis = [
      ['Active Clients', '124', 'up', '+6 vs July'],
      ['Retention Rate', '79%', 'up', '+2.1% vs July'],
      ['Churn Rate', '21%', 'down', '-1.4% vs July'],
      ['Renewing Clients', '38', 'up', '+4 vs July'],
      ['Avg. Time to Success', '15 days', 'down', '-5 days vs July'],
      ['CSM Capacity', '35%', 'up', '+4% vs July'],
    ];
    return `
    <div class="page-head">
      <h1>Dashboard</h1>
      <p>Monitor everything that matters — in one powerful dashboard for ${ph('CompanyName')}.</p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px">
        ${['Groups','KPIs','Charts','CSMs','AI'].map((t,i)=>
          `<button class="btn btn-sm ${i===1?'btn-accent':'btn-ghost'}">${t}</button>`).join('')}
        <div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap">
          ${['User','Date Range','Program'].map(f=>
            `<button class="btn btn-sm btn-ghost">${f}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('')}
          <button class="btn btn-sm btn-primary">Export</button>
        </div>
      </div>
    </div>

    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
      ${kpis.map(k=>`
        <div class="card kpi">
          <div class="label">${k[0]}</div>
          <div class="val">${k[1]}</div>
          <div class="delta ${k[2]}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="transform:rotate(${k[2]==='up'?'0':'180'}deg)"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${k[3]}
          </div>
        </div>`).join('')}
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="panel-head"><h3>Avg. Time to Success</h3><span class="sub">Actual avg 15 days · This week 10 days</span></div>
        <div class="card-pad">${chart('Horizontal bars — days-to-success per CSM (5→30d)', 240)}</div>
      </div>
      <div class="card">
        <div class="panel-head"><h3>Updated vs Non-Updated Profiles</h3></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:14px">
          ${chart('Donut 79.07 / 20.93', 150)}
          <div style="display:flex;gap:18px;justify-content:center;font-size:12.5px">
            <span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:var(--success-500)"></span>Updated 79.07%</span>
            <span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:var(--gray-300)"></span>Non-updated 20.93%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="dash-grid-3">
      <div class="card">
        <div class="panel-head"><h3>CSM Workload &amp; Capacity</h3><span class="sub">35% capacity</span></div>
        <div class="card-pad">${chart('Bars per CSM', 180)}</div>
      </div>
      <div class="card">
        <div class="panel-head"><h3>Churn Reason</h3></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:10px">
          ${[['Churn Reason 1','18.50%','amber'],['Churn Reason 2','79.07%','red'],['Churn Reason 3','2.43%','gray']]
            .map(r=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
              <span>${r[0]}</span><span class="badge badge-${r[2]}"><span class="dot"></span>${r[1]}</span></div>`).join('')}
          ${chart('Donut — churn reasons', 120)}
        </div>
      </div>
      <div class="card">
        <div class="panel-head"><h3>Engagement &amp; Feedback</h3><span class="sub">This week</span></div>
        <div class="card-pad" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${[['Reviews','580'],['Testimonials','580'],['Referrals','580'],['Profile Score','79.07%']]
            .map(m=>`<div style="border:1px solid var(--border);border-radius:var(--r-md);padding:12px">
              <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${m[0]}</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px">${m[1]}</div>
              <div style="font-size:11px;color:var(--success-600);font-weight:600;margin-top:2px">+0.43%</div></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dash-grid" style="margin-top:16px">
      <div class="card">
        <div class="panel-head"><h3>Renewal Opportunities by Month</h3></div>
        <div class="card-pad">${chart('Vertical bars by month (0→30)', 200)}</div>
      </div>
      <div class="card">
        <div class="panel-head"><h3>Offboarding by CSMs</h3><span class="sub">28 clients offboarded</span></div>
        <div class="card-pad">${chart('Bars per CSM', 200)}</div>
      </div>
    </div>`;
  }

  /* ---------- CLIENTS ----------
     Model mirrors public.clients + canonical enums:
       program_status_value: front-end | back-end | paused | suspended | off-boarded
       outcomes_buy_in_value / outcomes_progress_value: green | yellow | red
       outcomes_success_value: yes | no                                       */
  const STATUS = {
    'front-end':   { label: 'Front-end',   cls: 'green' },
    'back-end':    { label: 'Back-end',    cls: 'blue'  },
    'paused':      { label: 'Paused',      cls: 'amber' },
    'suspended':   { label: 'Suspended',   cls: 'red'   },
    'off-boarded': { label: 'Off-boarded', cls: 'gray'  },
  };
  const HEALTH  = { green:{label:'Green',cls:'green'}, yellow:{label:'Yellow',cls:'amber'}, red:{label:'Red',cls:'red'} };
  const SUCCESS = { yes:{label:'Yes',cls:'green'}, no:{label:'No',cls:'gray'} };
  // [client_name, csm, status, onboarded, renewal(contract_end), last_contact, next_contact, buy_in, progress, success]
  const clientsData = [
    ['Northwind Co','Maya Chen','front-end','11/01/2024','11/01/2025','02/06/2026','12/06/2026','green','green','no'],
    ['Brightlane','Adam Molloy','front-end','03/03/2024','03/03/2025','28/05/2026','09/06/2026','yellow','green','no'],
    ['Foundry SaaS','Maya Chen','back-end','27/02/2024','27/02/2025','01/06/2026','15/06/2026','green','green','yes'],
    ['Helio Systems','Priya Nair','back-end','30/04/2024','30/04/2025','03/06/2026','17/06/2026','green','yellow','yes'],
    ['Vertex Labs','Priya Nair','paused','19/09/2023','19/09/2024','14/04/2026','—','red','yellow','no'],
    ['Cloudpeak','Jay Goncalves','suspended','06/06/2023','06/06/2024','22/01/2026','—','red','red','no'],
    ['Siwash Co','Adam Molloy','off-boarded','25/08/2023','22/11/2023','29/12/2023','—','green','green','yes'],
    ['GR Digital','Jay Goncalves','off-boarded','02/10/2023','30/11/2023','15/12/2023','—','yellow','red','no'],
  ];
  function clients() {
    const field = (label, control) =>
      `<div><label style="display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:6px">${label}</label>${control}</div>`;
    const sel = (opts) => `<select class="ipt">${opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    const inp = (p,type) => `<input class="ipt" type="${type||'text'}" placeholder="${p||''}" />`;
    return `
    <style>
      .ipt{width:100%;border:1px solid var(--border-strong);border-radius:var(--r-md);padding:9px 12px;font-size:13px;font-family:inherit;color:var(--text-primary);background:#fff}
      .ipt:focus{outline:none;border-color:var(--blue-500);box-shadow:0 0 0 3px var(--blue-50)}
      .filters{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
      .seg{display:inline-flex;background:var(--gray-100);border-radius:var(--r-md);padding:3px}
      .seg button{border:none;background:none;padding:7px 16px;border-radius:var(--r-sm);font-size:13px;font-weight:600;color:var(--text-secondary)}
      .seg button.active{background:var(--blue-500);color:#fff}
      table{width:100%;border-collapse:collapse}
      thead th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;padding:0 14px 12px}
      tbody td{padding:16px 14px;border-top:1px solid var(--border);font-size:13.5px;vertical-align:middle}
      tbody tr:hover{background:var(--gray-50)}
      .client-cell{display:flex;align-items:center;gap:11px;font-weight:600;cursor:pointer}
      .client-cell .av{width:34px;height:34px;border-radius:var(--r-pill);object-fit:cover;flex:none}
      .client-cell .av.ph{background:var(--blue-50);color:var(--blue-700);display:grid;place-items:center;font-size:12px;font-weight:700}
      .client-cell .link-name{transition:color .12s}
      .client-cell:hover .link-name{color:var(--blue-600)}
      @media(max-width:1180px){.filters{grid-template-columns:repeat(2,1fr)}}
    </style>
    <div class="page-head" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><h1>Clients</h1><p>RetainOS pilot client data for ${ph('CompanyName')}. Quick Updates write to app-owned client state and history.</p></div>
      <button class="btn btn-accent">+ New Client</button>
    </div>

    <div class="card card-pad" style="margin-bottom:24px">
      <div class="filters">
        ${field('Company', sel(['Ethical Scaling','Acme Inc','Northwind Co']))}
        ${field('Client name', inp('Search clients'))}
        ${field('Status', sel(['All statuses','Front-end','Back-end','Paused','Suspended','Off-boarded']))}
        ${field('CSM', sel(['All CSMs','Adam Molloy','Maya Chen','Priya Nair','Jay Goncalves']))}
      </div>
      <div class="filters" style="grid-template-columns:repeat(2,1fr);margin-top:16px;max-width:50%">
        ${field('Offer', sel(['All offers','Front End','Back End']))}
        ${field('Last contact', inp('dd/mm/yyyy','date'))}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:14px;margin-top:18px;align-items:center">
        <button class="btn btn-ghost" style="border:none;color:var(--text-secondary)">Clear all filters</button>
        <button class="btn btn-accent">Apply filters</button>
      </div>
    </div>

    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
      <div><div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600">Client list</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px"><b style="color:var(--text-primary)">154</b> clients</div></div>
      <div class="seg" id="viewseg"><button class="active">List</button><button>Cards</button><button>Calendar</button></div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600">Sort</span>
        ${sel(['Renewal date','Last contact','Onboarded','Client name']).replace('class="ipt"','class="ipt" style="width:auto"')}
        <button class="btn btn-sm btn-ghost">Oldest first</button>
      </div>
    </div>

    <div id="client-view"></div>`;
  }

  /* avatar helper — self-contained inline styles so it works in any container */
  const avatar = (name, i, size) => {
    size = size || 34;
    const base = `width:${size}px;height:${size}px;border-radius:50%;flex:none;object-fit:cover`;
    return i % 2 === 0
      ? `<img src="https://i.pravatar.cc/96?img=${i+20}" alt="" style="${base}"/>`
      : `<span style="${base};background:var(--blue-50);color:var(--blue-700);display:grid;place-items:center;font-weight:700;font-size:${Math.round(size*0.36)}px">${name.slice(0,2).toUpperCase()}</span>`;
  };
  const badge = (k, map) => `<span class="badge badge-${map[k].cls}"><span class="dot"></span>${map[k].label}</span>`;

  /* ---- LIST view ---- */
  function clientListHTML() {
    return `<div class="card" style="padding:18px 8px;overflow-x:auto">
      <table>
        <thead><tr>
          ${['Client','CSM','Status','Onboarded','Renewal','Last contact','Next contact','Buy in','Progress','Success','']
            .map(h=>`<th>${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${clientsData.map((c,i)=>`
          <tr>
            <td><div class="client-cell client-open" data-name="${c[0]}">
              ${avatar(c[0],i)}<span class="link-name">${c[0]}</span></div></td>
            <td>${c[1]}</td>
            <td>${badge(c[2],STATUS)}</td>
            <td>${c[3]}</td><td>${c[4]}</td><td>${c[5]}</td><td style="color:var(--text-muted)">${c[6]}</td>
            <td>${badge(c[7],HEALTH)}</td>
            <td>${badge(c[8],HEALTH)}</td>
            <td>${badge(c[9],SUCCESS)}</td>
            <td><button class="btn btn-sm btn-ghost" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-700)" onclick="event.stopPropagation();openQuickUpdate('${c[0].replace(/'/g,'')}')">Quick Update</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* ---- CARDS view ---- */
  function clientCardsHTML() {
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${clientsData.map((c,i)=>`
        <div class="card card-pad client-open" data-name="${c[0]}" style="cursor:pointer;display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:center;gap:12px">
            ${avatar(c[0],i,44)}
            <div style="min-width:0"><div style="font-weight:600;font-size:15px">${c[0]}</div>
              <div style="font-size:12.5px;color:var(--text-secondary)">${c[1]}</div></div>
            <div style="margin-left:auto">${badge(c[2],STATUS)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:3px">Renewal</div>${c[4]}</div>
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:3px">Last contact</div>${c[5]}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--border);padding-top:12px">
            <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600">Buy-in</span>${badge(c[7],HEALTH)}
            <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-left:4px">Progress</span>${badge(c[8],HEALTH)}
          </div>
          <button class="btn btn-sm btn-ghost" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-700);justify-content:center" onclick="event.stopPropagation();openQuickUpdate('${c[0].replace(/'/g,'')}')">Quick Update</button>
        </div>`).join('')}
    </div>`;
  }

  /* ---- CALENDAR view ---- */
  function clientCalendarHTML() {
    // June 2026 grid. events keyed by day-of-month → [{name, csm, type, status}]
    const events = {
      7:  [['Ali Abdaal','Jay Goncalves','Next contact','back-end']],
      9:  [['Brightlane','Adam Molloy','Next contact','front-end']],
      12: [['Northwind Co','Maya Chen','Next contact','front-end']],
      15: [['Foundry SaaS','Maya Chen','Renewal','back-end']],
      17: [['Helio Systems','Priya Nair','Next contact','back-end']],
      24: [['Vertex Labs','Priya Nair','Task','paused']],
    };
    const TYPE = { 'Next contact':'blue','Last contact':'green','Task':'amber','Renewal':'red','Onboarded':'blue' };
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    // June 1 2026 is a Monday → leading: 31(Sun). Build 5 weeks.
    let cells = [['',31,true]];
    for (let d=1; d<=30; d++) cells.push(['',d,false]);
    while (cells.length % 7 !== 0) cells.push(['',cells.length-30,true]); // trailing July days
    const legend = [['Next','blue'],['Last','green'],['Task','amber'],['Renewal','red'],['Onboarded','blue']];
    return `
    <style>
      .cal-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
      .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--border)}
      .cal-grid .hd{background:var(--gray-50);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;padding:10px 12px}
      .cal-cell{background:#fff;min-height:108px;padding:8px 9px;display:flex;flex-direction:column;gap:5px}
      .cal-cell.out{background:var(--gray-50);color:var(--text-muted)}
      .cal-cell .dnum{font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:space-between}
      .cal-cell .today{background:var(--blue-500);color:#fff;width:22px;height:22px;border-radius:50%;display:grid;place-items:center}
      .cal-evt{border-radius:6px;padding:5px 7px;font-size:11px;line-height:1.25;border-left:3px solid}
      .cal-evt b{font-weight:600;display:block;font-size:11.5px}
    </style>
    <div class="cal-bar">
      <div><div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600">Contact calendar</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px"><b style="color:var(--text-primary)">6</b> events in June 2026</div></div>
      <div class="seg" style="margin-left:auto"><button class="active">Month</button><button>Week</button><button>Day</button></div>
      <button class="btn btn-sm btn-ghost">Previous</button>
      <span style="font-weight:600;font-size:14px;min-width:96px;text-align:center">June 2026</span>
      <button class="btn btn-sm btn-ghost">Next</button>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      ${legend.map(l=>`<span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:var(--${l[1]==='blue'?'blue-500':l[1]==='green'?'success-500':l[1]==='amber'?'warning-500':'danger-500'})"></span>${l[0]}</span>`).join('')}
    </div>
    <div class="cal-grid">
      ${dow.map(d=>`<div class="hd">${d}</div>`).join('')}
      ${cells.map(c=>{
        const day=c[1], out=c[2];
        const evs = (!out && events[day]) ? events[day] : [];
        return `<div class="cal-cell${out?' out':''}">
          <div class="dnum"><span class="${day===6&&!out?'today':''}">${day}</span>${evs.length?`<span style="color:var(--text-muted);font-weight:500">${evs.length}</span>`:''}</div>
          ${evs.map(e=>{const col=TYPE[e[2]];const v=col==='blue'?'blue-500':col==='green'?'success-500':col==='amber'?'warning-500':'danger-500';
            return `<div class="cal-evt client-open" data-name="${e[0]}" style="border-left-color:var(--${v});background:var(--${col==='blue'?'blue-50':col==='green'?'success-50':col==='amber'?'warning-50':'danger-50'});cursor:pointer">
              <b>${e[0]}</b><span style="color:var(--text-secondary)">${e[2]} · ${e[1]}</span></div>`;}).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  /* ---------- CSM REPORTS ---------- */
  /* ---------- CSM REPORTS ----------
     Mirrors CsmReports.tsx: profile-update compliance. Active clients only.
     Field Upkeep score + CSM Summary + Client Profile Updates. */
  function reports() {
    // [client, csm, status, progress, buyin, latestTitle, latestWhen, updated]
    const rep = [
      ['Northwind Co','Maya Chen','front-end','green','green','Quick update','Jun 2, 2026, 3:14 PM',true],
      ['Brightlane','Adam Molloy','front-end','green','yellow','Quick update','May 28, 2026, 10:02 AM',true],
      ['Foundry SaaS','Maya Chen','back-end','green','green','Status changed','Jun 1, 2026, 4:40 PM',true],
      ['Summit Co','Priya Nair','back-end','green','yellow','Quick update','Jun 3, 2026, 9:18 AM',true],
      ['Helio Systems','Priya Nair','back-end','yellow','green','',' ',false],
      ['Acme Renewals','Jay Goncalves','front-end','yellow','red','',' ',false],
    ];
    const total = rep.length, updated = rep.filter(r=>r[7]).length;
    const updateRate = Math.round(updated/total*100);
    const fields = [['Next Steps',67],['Milestone',50],['Last Contact',83],['Next Contact',50],['Progress',67],['Buy-in',83]];
    const upkeepScore = Math.round(fields.reduce((s,f)=>s+f[1],0)/fields.length);
    // CSM summary aggregation
    const byCsm = {};
    rep.forEach(r=>{ const k=r[1]; byCsm[k]=byCsm[k]||{t:0,u:0}; byCsm[k].t++; if(r[7]) byCsm[k].u++; });
    const csmRows = Object.entries(byCsm).map(([name,v])=>[name,v.t,v.u,v.t-v.u,Math.round(v.u/v.t*100)]).sort((a,b)=>a[0].localeCompare(b[0]));

    const sel = (label,opts) => `<div><label style="display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:6px">${label}</label><select class="ipt">${opts.map(o=>`<option>${o}</option>`).join('')}</select></div>`;
    const HCLS = { green:['green','Green'], yellow:['amber','Yellow'], red:['red','Red'] };
    const kpi = (label,val,cap) => `<div class="card kpi"><div class="label">${label}</div><div class="val">${val}</div><div class="cap">${cap}</div></div>`;
    const fieldRow = (label,score) => `
      <div style="padding:14px 0;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px"><span style="font-size:13.5px;font-weight:600;white-space:nowrap">${label}</span><span style="font-size:13.5px;font-weight:700;flex:none;color:${score>=70?'var(--success-600)':score>=50?'var(--warning-600)':'var(--danger-600)'}">${score}%</span></div>
        <div style="height:7px;border-radius:var(--r-pill);background:var(--gray-100);overflow:hidden"><div style="height:100%;width:${score}%;background:${score>=70?'var(--success-500)':score>=50?'var(--warning-500)':'var(--danger-500)'};border-radius:var(--r-pill)"></div></div>
      </div>`;

    return `
    <div class="page-head"><h1>CSM Reports</h1><p>Profile-update compliance for ${ph('CompanyName')} \u2014 across active clients in the selected range.</p></div>

    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:560px">
        ${sel('Company',['Ethical Scaling','Acme Inc','Northwind Group'])}
        ${sel('CSM',['All CSMs','Adam Molloy','Maya Chen','Priya Nair','Jay Goncalves'])}
      </div>
      <div style="margin-top:16px">
        <label style="display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:8px">Date Range</label>
        <div class="seg"><button>Today</button><button>7 days</button><button>14 days</button><button class="active">30 days</button><button>Custom</button></div>
      </div>
    </div>

    <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('Client Update Rate', updateRate+'%', updated+'/'+total+' clients touched')}
      ${kpi('Field Upkeep Score', upkeepScore+'%', 'across 6 tracked fields')}
      ${kpi('Complete Profiles', '2<span style="font-size:18px;color:var(--text-muted);font-weight:600">/'+total+'</span>', 'all fields fresh')}
      ${kpi('Active Clients', total, 'front-end + back-end')}
    </div>

    <div class="card" style="margin-top:16px;margin-bottom:16px">
      <div class="panel-head"><div><h3>Field Upkeep</h3><span class="sub">% of active clients with each field updated in range</span></div></div>
      <div class="card-pad fieldgrid" style="padding-top:6px;padding-bottom:14px">
        ${fields.map(f=>fieldRow(f[0],f[1])).join('')}
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="panel-head"><div><h3>CSM Summary</h3><span class="sub">Updated = at least one history event in the date range</span></div><span class="badge badge-green">RetainOS pilot data</span></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>CSM</th><th style="text-align:right">Clients</th><th style="text-align:right">Updated</th><th style="text-align:right">Not updated</th><th style="text-align:right">Rate</th></tr></thead>
          <tbody>${csmRows.map(c=>`<tr>
            <td style="font-weight:600">${c[0]}</td>
            <td style="text-align:right">${c[1]}</td>
            <td style="text-align:right;color:var(--success-600);font-weight:600">${c[2]}</td>
            <td style="text-align:right;color:var(--warning-600);font-weight:600">${c[3]}</td>
            <td style="text-align:right"><span class="badge badge-${c[4]>=80?'green':c[4]>=50?'amber':'red'}">${c[4]}%</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="panel-head"><div><h3>Client Profile Updates</h3><span class="sub">Showing the last 30 days</span></div></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Client</th><th>CSM</th><th>Status</th><th>Progress</th><th>Buy in</th><th>Latest update</th><th style="text-align:right">Updated?</th></tr></thead>
          <tbody>${rep.map(r=>`<tr>
            <td><div class="client-cell" data-name="${r[0]}"><span class="av ph" style="width:32px;height:32px;border-radius:var(--r-sm);background:var(--blue-50);color:var(--blue-700);display:grid;place-items:center;font-size:11px;font-weight:700;flex:none">${r[0].slice(0,2).toUpperCase()}</span><span class="link-name">${r[0]}</span></div></td>
            <td>${r[1]}</td>
            <td>${badge(r[2],STATUS)}</td>
            <td>${badge(r[3],HEALTH)}</td>
            <td>${badge(r[4],HEALTH)}</td>
            <td>${r[7]?`<div style="font-weight:600;font-size:13px">${r[5]}</div><div style="font-size:11.5px;color:var(--text-muted)">${r[6]}</div>`:`<span style="color:var(--text-muted)">No update in range</span>`}</td>
            <td style="text-align:right"><span class="badge badge-${r[7]?'green':'amber'}"><span class="dot"></span>${r[7]?'Updated':'Pending'}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* ---------- CLIENT DETAIL ----------
     Tabs mirror the live app: Client Details · Contract · Program · Outcomes ·
     Pathways & Milestones · Tasks · History. Fields map to public.clients columns. */
  const ARCHE = { 'Northwind Co':'driver','Brightlane':'follower','Foundry SaaS':'driver','Helio Systems':'analyst',
    'Vertex Labs':'follower','Cloudpeak':'expressive','Siwash Co':'follower','GR Digital':'analyst' };
  function clientRecord(name) {
    const c = clientsData.find(x => x[0] === name) || clientsData[0];
    const ageDays = { 'Siwash Co':1016 }[c[0]] || 540;
    return {
      name:c[0], csm:c[1], status:c[2], onboarded:c[3], renewal:c[4], last:c[5], next:c[6],
      buyIn:c[7], progress:c[8], success:c[9], idx:clientsData.indexOf(c),
      business:c[0], archetype:ARCHE[c[0]]||'follower', age:ageDays,
      email:`${c[0].toLowerCase().replace(/[^a-z]/g,'')}@example.com`,
    };
  }
  function fieldBox(label, valueHTML) {
    return `<div style="border:1px solid var(--border);border-radius:var(--r-md);padding:16px 18px;background:var(--bg-surface)">
      <div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:8px">${label}</div>
      <div style="font-size:15px;font-weight:500">${valueHTML}</div></div>`;
  }
  function clientDetail(name) {
    const r = clientRecord(name);
    const tab = (id,label) => `<button class="dtab${id==='details'?' active':''}" data-tab="${id}">${label}</button>`;
    const panel = (id,inner) => `<div class="dpanel" data-panel="${id}" style="display:${id==='details'?'block':'none'}">${inner}</div>`;
    const grid2 = (inner) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${inner}</div>`;

    const detailsPanel = grid2(
      fieldBox('Business name', r.business) + fieldBox('Archetype', r.archetype) +
      fieldBox('Status', badge(r.status, STATUS)) + fieldBox('Date onboarded', r.onboarded) +
      fieldBox('Client age', `${r.age.toLocaleString()} days`) + fieldBox('Email', `<a href="#">${r.email}</a>`)
    );
    const contractPanel = grid2(
      fieldBox('Contract start', r.onboarded) + fieldBox('Contract end', r.renewal) +
      fieldBox('Length', '365 days') + fieldBox('Monthly value', '<span class="ph-token">{MonthlyValue}</span>') +
      fieldBox('Auto-renew', badge(r.status==='off-boarded'?'no':'yes', SUCCESS)) + fieldBox('Reference link', '<a href="#">View agreement →</a>')
    ) + `<div style="margin-top:16px">${fieldBox('Contract notes', '<span class="ph-token">{ContractNotes}</span>')}</div>`;
    const programPanel = grid2(
      fieldBox('Program status', badge(r.status, STATUS)) + fieldBox('Current offer', r.status==='back-end'?'Back End':'Front End') +
      fieldBox('Current milestone', '<span class="ph-token">{MilestoneName}</span>') + fieldBox('Latest back-end start', r.status==='back-end'?r.onboarded:'—') +
      fieldBox('Latest paused date', r.status==='paused'?r.last:'—') + fieldBox('Next steps', '<span class="ph-token">{NextSteps}</span>')
    );
    const outcomesPanel = `<div style="display:flex;justify-content:flex-end;margin-bottom:16px"><button class="btn btn-accent btn-sm" onclick="openQuickUpdate('${r.name.replace(/'/g,'')}')">Quick Update</button></div>` +
      grid2(
        fieldBox('Buy-in', badge(r.buyIn, HEALTH) + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:400">Updated ${r.last}</div>`) +
        fieldBox('Progress', badge(r.progress, HEALTH) + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:400">Updated ${r.last}</div>`) +
        fieldBox('Success', badge(r.success, SUCCESS) + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:400">Updated ${r.last}</div>`) +
        fieldBox('Suitable', badge('yes', SUCCESS))
      );
    const milestones = [['Kickoff & onboarding','done'],['Foundations set','done'],['First win delivered',r.status==='front-end'?'current':'done'],['Scale & optimize',r.status==='back-end'?'current':'upcoming'],['Renewal / retention','upcoming']];
    const pathwaysPanel = `<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:14px">Current pathway · ${r.status==='back-end'?'Back End':'Front End'}</div>
      <div style="display:flex;flex-direction:column;gap:0">
      ${milestones.map((m,i)=>{
        const col = m[1]==='done'?'success-500':m[1]==='current'?'blue-500':'gray-300';
        return `<div style="display:flex;gap:14px;align-items:flex-start">
          <div style="display:flex;flex-direction:column;align-items:center">
            <span style="width:22px;height:22px;border-radius:50%;background:var(--${col});display:grid;place-items:center;color:#fff;font-size:11px;font-weight:700">${m[1]==='done'?'✓':i+1}</span>
            ${i<milestones.length-1?`<span style="width:2px;height:34px;background:var(--${m[1]==='done'?'success-500':'border'})"></span>`:''}
          </div>
          <div style="padding-top:1px"><div style="font-weight:600;font-size:14px">${m[0]}</div>
            <div style="font-size:12.5px;color:var(--text-muted)">${m[1]==='done'?'Completed':m[1]==='current'?'In progress':'Upcoming'}</div></div>
        </div>`;}).join('')}
      </div>`;
    const tasksPanel = `<div class="empty-box">No task rows found for this client.</div>`;
    const histEvents = [
      ['Quick update','quick_update',r.last,`Buy-in set to ${HEALTH[r.buyIn].label}, progress ${HEALTH[r.progress].label}.`],
      ['Status changed','client_status_changed',r.onboarded,`Status set to ${STATUS[r.status].label}.`],
      ['Client created','client_created',r.onboarded,`${r.name} onboarded by ${r.csm}.`],
    ];
    const ICON = { quick_update:'blue-500', client_status_changed:'warning-500', client_created:'success-500', client_offboarded:'danger-500' };
    const historyPanel = `<div style="display:flex;flex-direction:column;gap:0">
      ${histEvents.map((e,i)=>`<div style="display:flex;gap:14px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;align-items:center">
          <span style="width:12px;height:12px;border-radius:50%;background:var(--${ICON[e[1]]});margin-top:4px"></span>
          ${i<histEvents.length-1?`<span style="width:2px;flex:1;min-height:40px;background:var(--border)"></span>`:''}
        </div>
        <div style="padding-bottom:22px"><div style="display:flex;align-items:center;gap:10px"><span style="font-weight:600;font-size:14px">${e[0]}</span><span style="font-size:12px;color:var(--text-muted)">${e[2]}</span></div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:3px">${e[3]}</div></div>
      </div>`).join('')}
    </div>`;

    return `
    <style>
      .dtab{border:none;background:none;padding:12px 4px;margin-right:26px;font-size:14px;font-weight:600;color:var(--text-secondary);border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
      .dtab:hover{color:var(--text-primary)}
      .dtab.active{color:var(--blue-600);border-bottom-color:var(--blue-500)}
      .dtabs{display:flex;flex-wrap:nowrap;overflow-x:auto;border-bottom:1px solid var(--border);margin-bottom:22px;scrollbar-width:thin}
      .empty-box{border:1px dashed var(--border-strong);border-radius:var(--r-lg);padding:60px 20px;text-align:center;color:var(--text-muted);font-size:14px}
    </style>
    <button class="btn btn-ghost btn-sm" style="border:none;padding-left:0;color:var(--blue-600);margin-bottom:16px" onclick="goClients()">← Back to clients</button>
    <div class="card card-pad" style="margin-bottom:22px;display:flex;align-items:center;gap:18px">
      ${avatar(r.name, r.idx, 64)}
      <div><h1 style="font-size:26px">${r.name}</h1>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;color:var(--text-secondary);font-size:14px">${r.csm} <span style="color:var(--text-muted)">·</span> ${badge(r.status, STATUS)}</div></div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost">Change Status</button>
        <button class="btn btn-primary">Edit Profile</button>
        <span class="badge badge-green" style="padding:7px 14px">RetainOS pilot data</span>
      </div>
    </div>
    <div class="dtabs">
      ${tab('details','Client Details')}${tab('contract','Contract')}${tab('program','Program')}${tab('outcomes','Outcomes')}${tab('pathways','Pathways & Milestones')}${tab('tasks','Tasks')}${tab('history','History')}
    </div>
    ${panel('details', detailsPanel)}${panel('contract', contractPanel)}${panel('program', programPanel)}${panel('outcomes', outcomesPanel)}${panel('pathways', pathwaysPanel)}${panel('tasks', tasksPanel)}${panel('history', historyPanel)}`;
  }

  /* ---------- TASKS (full page) ----------
     Model mirrors public.client_tasks: status_value todo|in_progress|done, priority, task_due_date, assigned_to_id */
  function tasks() {
    const TASKDATA = [
      ['Send renewal proposal','Northwind Co','Maya Chen','12/06/2026','high','todo'],
      ['Prep QBR deck','Foundry SaaS','Maya Chen','15/06/2026','medium','todo'],
      ['Follow up on paused account','Vertex Labs','Priya Nair','08/06/2026','high','todo'],
      ['Onboarding call #2','Brightlane','Adam Molloy','09/06/2026','medium','in_progress'],
      ['Collect testimonial','Helio Systems','Priya Nair','17/06/2026','low','in_progress'],
      ['Offboarding summary','GR Digital','Jay Goncalves','01/06/2026','medium','done'],
    ];
    const PRIO = { high:'red', medium:'amber', low:'gray' };
    const COLS = [['todo','To Do'],['in_progress','In Progress'],['done','Done']];
    const taskCard = (t) => `<div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;cursor:pointer">
      <div style="font-weight:600;font-size:14px">${t[0]}</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${t[1]} · ${t[2]}</div>
      <div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);padding-top:10px">
        <span class="badge badge-${PRIO[t[4]]}" style="text-transform:capitalize"><span class="dot"></span>${t[4]}</span>
        <span style="font-size:12px;color:var(--text-muted);margin-left:auto">Due ${t[3]}</span></div></div>`;
    const sel = (opts) => `<select class="ipt">${opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    const fld = (label, ctrl) => `<div><label style="display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:6px">${label}</label>${ctrl}</div>`;
    return `
    <style>
      .ipt{width:100%;border:1px solid var(--border-strong);border-radius:var(--r-md);padding:9px 12px;font-size:13px;font-family:inherit;color:var(--text-primary);background:#fff}
      .ipt:focus{outline:none;border-color:var(--blue-500);box-shadow:0 0 0 3px var(--blue-50)}
      .tfilters{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:16px;align-items:end}
      .kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
      .kcol{background:var(--bg-sunken);border-radius:var(--r-lg);padding:14px;display:flex;flex-direction:column;gap:12px}
      .kcol-head{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600}
      .kcol-head .count{background:var(--gray-200);color:var(--gray-600);font-size:11px;border-radius:var(--r-pill);padding:1px 9px}
      @media(max-width:1100px){.tfilters{grid-template-columns:repeat(2,1fr)}.kanban{grid-template-columns:1fr}}
    </style>
    <div class="page-head" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><h1>Tasks</h1><p>RetainOS pilot tasks plus mirrored Glide tasks for ${ph('CompanyName')}.</p></div>
      <button class="btn btn-accent">+ New Task</button>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="tfilters">
        ${fld('Company', sel(['Ethical Scaling','Acme Inc']))}
        ${fld('View as', sel(['All CSMs','Adam Molloy','Maya Chen','Priya Nair','Jay Goncalves']))}
        ${fld('Status', sel(['Open tasks','All tasks','To Do','In Progress','Done']))}
        ${fld('Search', `<input class="ipt" placeholder="Task name or notes"/>`)}
        <div class="seg" id="taskseg" style="margin-bottom:0"><button class="active">Board</button><button>List</button></div>
      </div>
    </div>
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="card kpi"><div class="label">Company</div><div class="val" style="font-size:20px">Ethical Scaling</div></div>
      <div class="card kpi"><div class="label">Visible Tasks</div><div class="val">${TASKDATA.length}</div></div>
      <div class="card kpi"><div class="label">Overdue</div><div class="val">2</div></div>
    </div>
    <div class="kanban">
      ${COLS.map(col=>{const items=TASKDATA.filter(t=>t[5]===col[0]);
        return `<div class="kcol"><div class="kcol-head">${col[1]}<span class="count">${items.length}</span></div>
          ${items.map(taskCard).join('') || `<div style="font-size:12.5px;color:var(--text-muted);text-align:center;padding:18px 0">No tasks</div>`}</div>`;}).join('')}
    </div>`;
  }

  /* ---------- SAAS CLIENTS ----------
     Mirrors SaasClients.tsx: company cards (slate band + initials, director·role,
     Active/Archived pill, team count + synced), Search + status segmented, Add modal. */
  // [name, director, role, team, synced, archived, tier]
  const saasData = [
    ['Ethical Scaling','Jay Goncalves','Director',14,'Jun 5, 2026',false,'Pro / Enterprise / DFY'],
    ['Acme Inc','Jane Smith','Director',8,'Jun 2, 2026',false,'Growth'],
    ['Northwind Group','Maya Chen','Director',12,'Jun 4, 2026',false,'Pro / Enterprise / DFY'],
    ['Brightlane Co','Adam Molloy','Director',6,'May 28, 2026',false,'Starter'],
    ['Helio Systems','Priya Nair','Director',9,'Jun 1, 2026',false,'Growth'],
    ['Vertex Labs','Sam Reeve','Director',5,'Apr 14, 2026',false,'Starter'],
    ['Foundry SaaS','Lena Ortiz','Director',11,'Jun 3, 2026',false,'Growth'],
    ['Cloudpeak','Tom Becker','Director',4,'Jan 22, 2026',true,'Starter'],
  ];
  function saasInitials(name){ return name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
  function saas() {
    const active = saasData.filter(c=>!c[5]).length, archived = saasData.filter(c=>c[5]).length;
    return `
    <style>
      .saas-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
      .saas-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-xs);overflow:hidden;transition:box-shadow .12s,border-color .12s}
      .saas-card:hover{box-shadow:var(--shadow-sm)}
      .saas-band{height:92px;background:var(--gray-100);display:grid;place-items:center}
      .saas-band .ava{width:56px;height:56px;border-radius:var(--r-pill);background:#fff;display:grid;place-items:center;font-weight:700;color:var(--gray-500);font-size:15px;box-shadow:var(--shadow-xs)}
      .saas-seg{display:inline-flex;background:#fff;border:1px solid var(--border);border-radius:var(--r-md);padding:3px}
      .saas-seg button{border:none;background:none;padding:7px 14px;border-radius:var(--r-sm);font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer}
      .saas-seg button.active{background:var(--blue-600);color:#fff}
    </style>
    <div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue-600)">Super Admin</div>
        <h1 style="margin-top:4px">SaaS Clients</h1>
        <p>Manage company accounts and choose the company you want to view as.</p>
      </div>
      <button class="btn btn-accent" onclick="openAddSaas()">+ Add New SaaS Client</button>
    </div>

    <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <label style="display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:6px">Search</label>
        <input class="ipt" type="search" placeholder="Company, team member, or email" />
      </div>
      <div class="saas-seg">
        <button class="active">Active ${active}</button>
        <button>Paused 0</button>
        <button>Archived ${archived}</button>
      </div>
    </div>

    <div class="saas-grid">
      ${saasData.filter(c=>!c[5]).map(c=>`
        <article class="saas-card">
          <div class="saas-band"><div class="ava">${saasInitials(c[0])}</div></div>
          <div style="padding:16px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
              <div style="min-width:0">
                <div style="font-weight:600;font-size:15px;cursor:pointer" onclick="openSaas('${c[0]}')">${c[0]}</div>
                <div style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">${c[1]} · ${c[2]}</div>
              </div>
              <span class="badge badge-green"><span class="dot"></span>Active</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;font-size:12.5px">
              <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);font-weight:600">Team</div><div style="font-weight:700;margin-top:2px">${c[3]}</div></div>
              <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);font-weight:600">Synced</div><div style="font-weight:700;margin-top:2px">${c[4]}</div></div>
            </div>
            <div style="display:flex;gap:8px;margin-top:16px">
              <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center" onclick="openSaas('${c[0]}')">View</button>
              <button class="btn btn-accent btn-sm" style="flex:1;justify-content:center">View as</button>
            </div>
          </div>
        </article>`).join('')}
    </div>`;
  }

  /* ---------- SAAS CLIENT DETAIL (light) ---------- */
  function saasDetail(name){
    const c = saasData.find(x=>x[0]===name) || saasData[0];
    const toggle = (label,on) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:14px;font-weight:500">${label}</span>
      <span style="width:40px;height:22px;border-radius:var(--r-pill);background:${on?'var(--blue-500)':'var(--gray-300)'};position:relative;flex:none">
        <span style="position:absolute;top:2px;${on?'right:2px':'left:2px'};width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:var(--shadow-xs)"></span></span></div>`;
    return `
    <button class="btn btn-ghost btn-sm" style="border:none;padding-left:0;color:var(--blue-600);margin-bottom:16px" onclick="go('saas')">← Back to SaaS Clients</button>
    <div class="card card-pad" style="margin-bottom:22px;display:flex;align-items:center;gap:18px">
      <div style="width:60px;height:60px;border-radius:var(--r-pill);background:var(--gray-100);display:grid;place-items:center;font-weight:700;color:var(--gray-500);font-size:16px">${saasInitials(c[0])}</div>
      <div><h1 style="font-size:24px">${c[0]}</h1>
        <div style="color:var(--text-secondary);font-size:14px;margin-top:4px">${c[1]} · ${c[2]} <span style="color:var(--text-muted)">·</span> <span class="badge badge-${c[5]?'gray':'green'}"><span class="dot"></span>${c[5]?'Archived':'Active'}</span></div></div>
      <div style="margin-left:auto;display:flex;gap:10px">
        <button class="btn btn-ghost">Edit</button>
        <button class="btn btn-accent">View as ${c[0]}</button>
      </div>
    </div>
    <div class="dash-grid">
      <div class="card card-pad">
        <h3 style="font-size:15px;margin-bottom:6px">Customization</h3>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 8px">Feature flags for this company.</p>
        ${toggle('Enable secondary assignee', true)}
        ${toggle('Enable Call AI for CSMs', false)}
        ${toggle('View override', false)}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0">
          <span style="font-size:14px;font-weight:500">Subscription tier</span>
          <span class="badge badge-blue">${c[6]}</span>
        </div>
      </div>
      <div class="card">
        <div class="panel-head"><h3>Team</h3><span class="sub">${c[3]} members</span></div>
        <div style="padding:8px 0">
          ${[['Jay Goncalves','Director','director'],['Maya Chen','CSM','csm'],['Adam Molloy','CSM','csm'],['Priya Nair','Support','support'],['Sam Reeve','Viewer','viewer']].slice(0,Math.min(5,c[3])).map((m,i)=>`
            <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-top:${i?'1px solid var(--border)':'none'}">
              ${avatar(m[0],i,36)}
              <div style="min-width:0"><div style="font-weight:600;font-size:13.5px">${m[0]}</div><div style="font-size:12px;color:var(--text-muted)">${m[0].toLowerCase().replace(/[^a-z]/g,'')}@example.com</div></div>
              <span class="badge badge-gray" style="margin-left:auto;text-transform:capitalize">${m[1]}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  window.openSaas = function(name){ go('saasDetail', name); };
  window.openAddSaas = function(){
    const m = document.createElement('div'); m.id='qu-modal';
    const fld = (label,ph) => `<div style="margin-bottom:16px"><label class="qu-lbl">${label}</label><input class="ipt" placeholder="${ph}" disabled style="background:var(--gray-50);color:var(--text-muted)"/></div>`;
    m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(14,27,41,.45);z-index:100;display:grid;place-items:center;padding:24px" onclick="if(event.target===this)this.parentElement.remove()">
      <div class="card" style="width:560px;max-width:100%;box-shadow:var(--shadow-lg)">
        <style>#qu-modal .qu-lbl{display:block;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px}#qu-modal .ipt:disabled{cursor:not-allowed}</style>
        <div class="panel-head" style="align-items:flex-start"><div><h3 style="font-size:19px">Add New SaaS Client</h3><p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">Read-only preview. Company creation is locked until write mode is approved.</p></div>
          <button class="icon-btn" style="width:30px;height:30px;border:none" onclick="document.getElementById('qu-modal').remove()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="card-pad">
          ${fld('Company Name*','Acme Inc')}${fld('Director Name*','Jane Smith')}${fld('Director Email*','jane@example.com')}${fld('Logo','Upload file')}
          <div style="margin-bottom:16px"><label class="qu-lbl">Subscription Tier</label>
            <select class="ipt" disabled style="background:var(--gray-50);color:var(--text-muted)"><option>Starter</option><option>Growth</option><option>Pro / Enterprise / DFY</option></select></div>
          <div class="badge badge-amber" style="display:block;border-radius:var(--r-md);padding:12px 14px;font-weight:500">Company ID will be generated automatically when write mode is enabled.</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid var(--border)">
          <button class="btn btn-ghost" onclick="document.getElementById('qu-modal').remove()">Cancel</button>
          <button class="btn btn-accent" disabled style="opacity:.5;cursor:not-allowed">Submit</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
  };

  /* ---------- STUB ---------- */
  function stub(title) {
    return `<div class="page-head"><h1>${title}</h1><p>This is a <b>Dev Tools</b> screen (temporary). It's wired into the shell and ready to design — say the word and I'll build it from <code>${title.replace(/ /g,'')}.tsx</code>.</p></div>
    <div class="card stub">${chart(title + ' — coming next', 280)}
      <h3 style="margin-top:22px">${title}</h3><p>Wired into the shell and ready to design.</p></div>`;
  }

  /* ---------- router ---------- */
  const routes = {
    dashboard: { fn: dashboard, title: () => `Welcome back, <span class="ph-token">{FirstName}</span>` },
    clients:   { fn: clients,   title: () => 'Clients' },
    reports:   { fn: reports,   title: () => 'CSM Reports' },
    tasks:     { fn: tasks,     title: () => 'Tasks' },
    saas:      { fn: saas,      title: () => 'SaaS Clients' },
  };
  let clientViewMode = 'list';
  try { clientViewMode = localStorage.getItem('retainos.clientView') || 'list'; } catch (e) {}

  window.renderClientView = function (mode) {
    clientViewMode = mode;
    try { localStorage.setItem('retainos.clientView', mode); } catch (e) {}
    const host = document.getElementById('client-view'); if (!host) return;
    host.innerHTML = mode === 'cards' ? clientCardsHTML() : mode === 'calendar' ? clientCalendarHTML() : clientListHTML();
    const seg = document.getElementById('viewseg');
    if (seg) [...seg.children].forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === mode));
  };
  window.openClient = function (name) { go('client', name); };
  window.goClients = function () { go('clients'); };

  function go(route, param) {
    if (route === 'client' || route === 'saasDetail') {
      const navRoute = route === 'client' ? 'clients' : 'saas';
      content.innerHTML = route === 'client' ? clientDetail(param) : saasDetail(param);
      topTitle.textContent = param;
      [...nav.querySelectorAll('.sb-item')].forEach(b => b.classList.toggle('active', b.dataset.route === navRoute));
      localStorage.setItem('retainos.route', JSON.stringify({ route, title: param }));
      content.scrollTop = 0; return;
    }
    const r = routes[route];
    if (r) { content.innerHTML = r.fn(); topTitle.innerHTML = r.title(); }
    else { content.innerHTML = stub(param || 'Screen'); topTitle.textContent = param || 'Screen'; }
    [...nav.querySelectorAll('.sb-item')].forEach(b => {
      const match = b.dataset.route === route && (route !== 'stub' || b.dataset.title === param);
      b.classList.toggle('active', match);
    });
    if (route === 'clients') window.renderClientView(clientViewMode);
    localStorage.setItem('retainos.route', JSON.stringify({ route, title: param }));
    content.scrollTop = 0;
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.sb-item'); if (!b) return;
    go(b.dataset.route, b.dataset.title);
  });

  // delegated interactions (content re-renders)
  document.addEventListener('click', (e) => {
    const view = e.target.closest('#viewseg button');
    if (view) { window.renderClientView(view.textContent.toLowerCase()); return; }
    const tseg = e.target.closest('#taskseg button');
    if (tseg) { [...tseg.parentElement.children].forEach(x => x.classList.toggle('active', x === tseg)); return; }
    const dtab = e.target.closest('.dtab');
    if (dtab) {
      [...document.querySelectorAll('.dtab')].forEach(x => x.classList.toggle('active', x === dtab));
      document.querySelectorAll('.dpanel').forEach(p => p.style.display = p.dataset.panel === dtab.dataset.tab ? 'block' : 'none');
      return;
    }
    const open = e.target.closest('.client-open');
    if (open) { window.openClient(open.dataset.name); return; }
  });

  // restore
  let start = { route: 'dashboard' };
  try { const s = JSON.parse(localStorage.getItem('retainos.route')); if (s && s.route) start = s; } catch (e) {}
  go(start.route, start.title);

  /* ---------- Quick Update modal ----------
     Mirrors manage-client-quick-update payload:
       buyInStatus/progressStatus ∈ {green,yellow,red}, successStatus ∈ {yes,no},
       lastContactAt, nextContactAt, nextSteps, notes → client_history_events + clients.outcomes_* */
  window.openQuickUpdate = function (name) {
    const m = document.createElement('div');
    m.id = 'qu-modal';
    const hpick = (label, name) => `<div><label class="qu-lbl">${label}</label>
      <div class="seg hseg" data-field="${name}">
        <button type="button" data-v="green" class="active"><span class="hd" style="background:var(--success-500)"></span>Green</button>
        <button type="button" data-v="yellow"><span class="hd" style="background:var(--warning-500)"></span>Yellow</button>
        <button type="button" data-v="red"><span class="hd" style="background:var(--danger-500)"></span>Red</button>
      </div></div>`;
    m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(14,27,41,.45);z-index:100;display:grid;place-items:center;padding:24px" onclick="if(event.target===this)this.parentElement.remove()">
      <div class="card" style="width:520px;max-width:100%;box-shadow:var(--shadow-lg)">
        <style>
          #qu-modal .qu-lbl{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);font-weight:600;margin-bottom:6px}
          #qu-modal .seg{width:100%}
          #qu-modal .seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px}
          #qu-modal .hseg .hd{width:9px;height:9px;border-radius:50%;display:inline-block}
          #qu-modal input,#qu-modal textarea{width:100%;border:1px solid var(--border-strong);border-radius:var(--r-md);padding:9px 12px;font-size:13px;font-family:inherit;color:var(--text-primary)}
          #qu-modal input:focus,#qu-modal textarea:focus{outline:none;border-color:var(--blue-500);box-shadow:0 0 0 3px var(--blue-50)}
        </style>
        <div class="panel-head"><h3>Quick Update — ${name}</h3>
          <button class="icon-btn" style="width:30px;height:30px;border:none" onclick="document.getElementById('qu-modal').remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:16px">
          ${hpick('Buy-in','buyInStatus')}
          ${hpick('Progress','progressStatus')}
          <div><label class="qu-lbl">Success</label>
            <div class="seg hseg" data-field="successStatus">
              <button type="button" data-v="yes">Yes</button>
              <button type="button" data-v="no" class="active">No</button>
            </div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div><label class="qu-lbl">Last contact</label><input type="date"/></div>
            <div><label class="qu-lbl">Next contact</label><input type="date"/></div>
          </div>
          <div><label class="qu-lbl">Next steps</label><input type="text" placeholder="What happens next?"/></div>
          <div><label class="qu-lbl">Notes</label><textarea rows="3" placeholder="What changed?" style="resize:vertical"></textarea></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px;border-top:1px solid var(--border)">
          <span style="font-size:11px;color:var(--text-muted)">Writes to client history &amp; outcomes</span>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" onclick="document.getElementById('qu-modal').remove()">Cancel</button>
            <button class="btn btn-accent" onclick="document.getElementById('qu-modal').remove()">Save update</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('.hseg').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      [...seg.children].forEach(x => x.classList.toggle('active', x === b));
    }));
  };
})();
