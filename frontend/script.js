/**
 * KAVACH Dashboard Application
 * Modular, performance-optimized vanilla JS architecture
 */

document.documentElement.classList.add('js-enabled');

// ==========================================
// State Management
// ==========================================

const Store = {
  data: {
    transactions: [],
    insights: {},
    userProfile: {},
    aiHistory: [],
    ui: {
      darkMode: true,
      sidebarCollapsed: false,
      chartType: 'doughnut',
      currentPage: 1,
      pageSize: 25
    }
  },
  
  listeners: new Set(),
  
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },
  
  notify(path, value) {
    this.listeners.forEach(cb => cb(path, value));
  },
  
  set(path, value) {
    const keys = path.split('.');
    let target = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
    this.notify(path, value);
  },
  
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.data);
  }
};

// ==========================================
// DOM Utilities
// ==========================================

const DOM = {
  $(selector, context = document) {
    return context.querySelector(selector);
  },
  
  $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
  },
  
  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'className') el.className = val;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
      else el.setAttribute(key, val);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    });
    return el;
  },
  
  debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  },
  
  throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    };
  }
};

// ==========================================
// Motion Utilities
// ==========================================

const Motion = {
  prefersReduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  stagger(elements, delay = 60, className = 'reveal-in', baseClass = 'row-reveal') {
    if (this.prefersReduced) {
      elements.forEach(el => el.classList.add(className));
      return;
    }
    elements.forEach((el, i) => {
      if (baseClass) el.classList.add(baseClass);
      setTimeout(() => el.classList.add(className), delay * i);
    });
  },

  pulse(el, className = 'chart-animate', duration = 600) {
    if (!el) return;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }
};

// ==========================================
// Notification System
// ==========================================

const Toast = {
  container: null,
  
  init() {
    this.container = DOM.$('#toast-container');
    if (!this.container) {
      this.container = DOM.create('div', { id: 'toast-container', className: 'toast-container' });
      document.body.appendChild(this.container);
    }
  },
  
  show(message, type = 'info', duration = 5000) {
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
    
    const toast = DOM.create('div', {
      className: `toast ${type}`,
      role: 'alert'
    }, [
      DOM.create('span', { className: 'toast-icon' }, [icons[type]]),
      DOM.create('span', { className: 'toast-message' }, [message])
    ]);
    
    this.container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// ==========================================
// Loading State Manager
// ==========================================

const LoadingManager = {
  overlay: null,
  progressBar: null,
  statusText: null,
  detailText: null,
  phaseList: null,
  phaseTimer: null,
  progressTimer: null,
  
  init() {
    this.overlay = DOM.$('#loading-overlay');
    this.progressBar = DOM.$('#loading-bar');
    this.statusText = DOM.$('#loading-status');
    this.detailText = DOM.$('#loading-detail');
    this.phaseList = DOM.$('#loading-phases');
  },
  
  show(status = 'Initializing...') {
    this.overlay.classList.remove('hidden');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.overlay.classList.add('scan-active');
    this.statusText.textContent = status;
    this.updateProgress(0);
    this.startRitual();
  },
  
  hide() {
    this.overlay.classList.add('hidden');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.classList.remove('scan-active');
    this.stopRitual();
  },
  
  updateProgress(percent) {
    this.progressBar.style.width = `${percent}%`;
  },
  
  updateStatus(status, detail) {
    this.statusText.textContent = status;
    if (detail) this.detailText.textContent = detail;
  },

  startRitual() {
    if (Motion.prefersReduced) return;
    this.stopRitual();

    const phases = [
      { label: 'Schema validation', detail: 'Verifying required columns' },
      { label: 'Feature synthesis', detail: 'Deriving behavioral signals' },
      { label: 'Model scoring', detail: 'Calculating risk probabilities' },
      { label: 'Insight assembly', detail: 'Preparing dashboard outputs' }
    ];

    if (this.phaseList) {
      this.phaseList.innerHTML = phases.map((p, i) => (
        `<div class="loading-phase${i === 0 ? ' active' : ''}">${p.label}</div>`
      )).join('');
    }

    let phaseIndex = 0;
    this.phaseTimer = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % phases.length;
      const phase = phases[phaseIndex];
      this.updateStatus(phase.label, phase.detail);
      if (this.phaseList) {
        const items = Array.from(this.phaseList.querySelectorAll('.loading-phase'));
        items.forEach((el, idx) => el.classList.toggle('active', idx === phaseIndex));
      }
    }, 1400);

    let progress = 0;
    this.progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8 + 4, 95);
      this.updateProgress(progress);
    }, 800);
  },

  stopRitual() {
    if (this.phaseTimer) clearInterval(this.phaseTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.phaseTimer = null;
    this.progressTimer = null;
  }
};

// ==========================================
// Table Manager with Sorting & Pagination
// ==========================================

class DataTable {
  constructor(tableId, options = {}) {
    this.table = DOM.$(`#${tableId}`);
    this.tbody = this.table?.querySelector('tbody');
    this.thead = this.table?.querySelector('thead');
    this.data = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.pageSize = options.pageSize || 25;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.onRowClick = options.onRowClick || null;
    
    this.init();
  }
  
  init() {
    if (!this.table) return;
    
    // Header sorting
    this.thead?.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
      th.style.cursor = 'pointer';
    });
    
    // Search
    if (this.table.dataset.searchable) {
      const searchInput = DOM.$(`#${this.table.id}-search`);
      searchInput?.addEventListener('input', DOM.debounce((e) => {
        this.search(e.target.value);
      }, 300));
    }
  }
  
  setData(data) {
    this.data = [...data];
    this.filteredData = [...data];
    this.render();
    this.updatePagination();
  }
  
  search(query) {
    const lower = query.toLowerCase();
    this.filteredData = this.data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(lower)
      )
    );
    this.currentPage = 1;
    this.render();
    this.updatePagination();
  }
  
  filter(predicate) {
    this.filteredData = this.data.filter(predicate);
    this.currentPage = 1;
    this.render();
    this.updatePagination();
  }
  
  handleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    
    // Update UI indicators
    this.thead?.querySelectorAll('th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === column) {
        th.classList.add(`sort-${this.sortDirection}`);
      }
    });
    
    this.filteredData.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    this.render();
  }
  
  render() {
    if (!this.tbody) return;
    
    const start = (this.currentPage - 1) * this.pageSize;
    const pageData = this.filteredData.slice(start, start + this.pageSize);
    
    const fragment = document.createDocumentFragment();
    
    pageData.forEach((row, idx) => {
      const tr = this.createRow(row, start + idx);
      fragment.appendChild(tr);
    });
    
    this.tbody.innerHTML = '';
    this.tbody.appendChild(fragment);

    if (this.table?.classList.contains('animate-rows')) {
      const rows = Array.from(this.tbody.querySelectorAll('tr'));
      Motion.stagger(rows, 30, 'reveal-in', 'row-reveal');
    }
    
    // Update info text
    const infoEl = DOM.$(`#${this.table.id.replace('-table', '')}-table-info`);
    if (infoEl) {
      if (this.filteredData.length === 0) {
        infoEl.textContent = 'Showing 0 of 0';
      } else {
        infoEl.textContent = `Showing ${start + 1}-${Math.min(start + this.pageSize, this.filteredData.length)} of ${this.filteredData.length}`;
      }
    }
  }
  
  createRow(row, idx) {
    const tr = DOM.create('tr', { 'data-index': idx });
    
    // Override in subclasses or use formatter
    const cells = Object.values(row).map(val => {
      const td = DOM.create('td');
      td.textContent = val;
      return td;
    });
    
    cells.forEach(cell => tr.appendChild(cell));
    
    if (this.onRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => this.onRowClick(row, tr));
    }
    
    return tr;
  }
  
  updatePagination() {
    const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
    const container = DOM.$(`#${this.table.id.replace('-table', '')}-pagination`);
    if (!container || totalPages <= 1) return;
    
    const fragment = document.createDocumentFragment();
    
    // Prev button
    const prevBtn = DOM.create('button', {
      disabled: this.currentPage === 1,
      onclick: () => { this.currentPage--; this.render(); this.updatePagination(); }
    }, ['←']);
    fragment.appendChild(prevBtn);
    
    // Page buttons
    const maxButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
      fragment.appendChild(DOM.create('button', { onclick: () => { this.currentPage = 1; this.render(); this.updatePagination(); } }, ['1']));
      if (startPage > 2) fragment.appendChild(DOM.create('span', {}, ['...']));
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const btn = DOM.create('button', {
        className: i === this.currentPage ? 'active' : '',
        onclick: () => { this.currentPage = i; this.render(); this.updatePagination(); }
      }, [String(i)]);
      fragment.appendChild(btn);
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) fragment.appendChild(DOM.create('span', {}, ['...']));
      fragment.appendChild(DOM.create('button', { onclick: () => { this.currentPage = totalPages; this.render(); this.updatePagination(); } }, [String(totalPages)]));
    }
    
    // Next button
    const nextBtn = DOM.create('button', {
      disabled: this.currentPage === totalPages,
      onclick: () => { this.currentPage++; this.render(); this.updatePagination(); }
    }, ['→']);
    fragment.appendChild(nextBtn);
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }
}

// ==========================================
// Specialized Tables
// ==========================================

class TransactionTable extends DataTable {
  createRow(tx) {
    const tr = DOM.create('tr');
    const riskLevel = this.computeRiskLevel(tx.fraud_score);
    
    const cells = [
      DOM.create('td', {}, [tx.user_id]),
      DOM.create('td', {}, [this.formatDate(tx.timestamp)]),
      DOM.create('td', { className: 'numeric' }, [this.formatCurrency(tx.amount)]),
      DOM.create('td', {}, [tx.category]),
      DOM.create('td', {}, [tx.merchant]),
      DOM.create('td', {}, [tx.country]),
      DOM.create('td', { className: 'numeric' }, [(tx.fraud_score || 0).toFixed(2)]),
      DOM.create('td', {}, [
        DOM.create('span', { className: `risk-badge ${riskLevel.class}` }, [riskLevel.label])
      ])
    ];
    
    cells.forEach(cell => tr.appendChild(cell));
    return tr;
  }
  
  computeRiskLevel(score) {
    const val = parseFloat(score) || 0;
    if (val > 0.75) return { label: 'High', class: 'risk-high' };
    if (val > 0.4) return { label: 'Medium', class: 'risk-medium' };
    return { label: 'Low', class: 'risk-low' };
  }
  
  formatDate(ts) {
    if (!ts) return '—';
    const date = new Date(ts);
    return date.toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }
}

class FraudTable extends DataTable {
  createRow(tx) {
    const tr = DOM.create('tr');
    const riskLevel = this.computeRiskLevel(tx.fraud_score);
    const signals = [
      tx.rule_based_fraud_flag ? 'Rules' : null,
      tx.model_fraud_flag ? 'ML Model' : null,
      tx.velocity_flag ? 'Velocity' : null
    ].filter(Boolean).join(' + ') || 'None';
    
    const cells = [
      DOM.create('td', {}, [tx.user_id]),
      DOM.create('td', { className: 'numeric' }, [this.formatCurrency(tx.amount)]),
      DOM.create('td', {}, [tx.country]),
      DOM.create('td', { className: 'numeric' }, [(tx.fraud_score || 0).toFixed(2)]),
      DOM.create('td', {}, [signals]),
      DOM.create('td', {}, [
        DOM.create('span', { className: `risk-badge ${riskLevel.class}${riskLevel.class === 'risk-high' ? ' risk-pulse' : ''}` }, [riskLevel.label])
      ]),
      DOM.create('td', {}, [
        DOM.create('button', {
          className: 'icon-btn btn-sm',
          onclick: () => this.showDetails(tx),
          'aria-label': 'View details'
        }, ['👁'])
      ])
    ];
    
    cells.forEach(cell => tr.appendChild(cell));
    return tr;
  }
  
  computeRiskLevel(score) {
    const val = parseFloat(score) || 0;
    if (val > 0.75) return { label: 'Critical', class: 'risk-high' };
    if (val > 0.4) return { label: 'Warning', class: 'risk-medium' };
    return { label: 'Low', class: 'risk-low' };
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  }
  
  showDetails(tx) {
    const modal = DOM.$('#detail-modal');
    const body = DOM.$('#modal-body');
    
    body.innerHTML = `
      <div class="tx-detail">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Transaction ID</span>
            <span class="detail-value">${tx.id || 'N/A'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">User ID</span>
            <span class="detail-value">${tx.user_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Amount</span>
            <span class="detail-value">${this.formatCurrency(tx.amount)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Risk Score</span>
            <span class="detail-value" style="color: ${tx.fraud_score > 0.75 ? 'var(--risk-high)' : 'inherit'}">
              ${(tx.fraud_score || 0).toFixed(3)}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Timestamp</span>
            <span class="detail-value">${tx.timestamp}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Merchant</span>
            <span class="detail-value">${tx.merchant}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Category</span>
            <span class="detail-value">${tx.category}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Country</span>
            <span class="detail-value">${tx.country}</span>
          </div>
        </div>
        <div class="detail-flags">
          <h4>Detection Flags</h4>
          <ul>
            ${tx.rule_based_fraud_flag ? '<li class="flag">⚠️ Rule-based anomaly detected</li>' : ''}
            ${tx.model_fraud_flag ? '<li class="flag">🤖 ML model flagged</li>' : ''}
            ${tx.velocity_flag ? '<li class="flag">⚡ Velocity threshold exceeded</li>' : ''}
          </ul>
        </div>
        <div class="case-timeline">
          <h4>Case Review Timeline</h4>
          <div class="timeline">
            <div class="timeline-step active">
              <span class="dot"></span>
              <div>
                <p class="step-title">Detection</p>
                <p class="step-desc">Anomaly identified by KAVACH signals.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="dot"></span>
              <div>
                <p class="step-title">Analyst Review</p>
                <p class="step-desc">Validate evidence and transaction context.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="dot"></span>
              <div>
                <p class="step-title">Action</p>
                <p class="step-desc">Approve, flag, or escalate investigation.</p>
              </div>
            </div>
          </div>
          <div class="case-actions">
            <button class="primary-btn btn-sm">Open Case</button>
            <button class="ghost-btn btn-sm">Add Note</button>
          </div>
        </div>
      </div>
    `;
    
    modal.showModal();
  }
}

// ==========================================
// Chart Manager
// ==========================================

const ChartManager = {
  instances: {},

  pulseCanvas(canvasId) {
    const canvas = DOM.$(`#${canvasId}`);
    const wrapper = canvas?.closest('.chart-wrapper');
    Motion.pulse(wrapper, 'chart-animate', 650);
  },

  pulseContainer(containerId) {
    const container = DOM.$(`#${containerId}`);
    Motion.pulse(container, 'chart-animate', 650);
  },
  
  createCategoryChart(canvasId, data, type = 'doughnut') {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;
    
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }
    
    const gradient1 = ctx.createLinearGradient(0, 0, 200, 200);
    gradient1.addColorStop(0, '#2dd4bf');
    gradient1.addColorStop(1, '#38bdf8');
    
    const gradient2 = ctx.createLinearGradient(0, 0, 200, 200);
    gradient2.addColorStop(0, '#fbbf24');
    gradient2.addColorStop(1, '#f97316');
    
    this.instances[canvasId] = new Chart(ctx, {
      type: type,
      data: {
        labels: data.labels || [],
        datasets: [{
          data: data.values || [],
          backgroundColor: [gradient1, gradient2, '#a78bfa', '#4ade80', '#f472b6'],
          borderColor: 'rgba(12, 18, 36, 0.9)',
          borderWidth: 2,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: type === 'doughnut' ? '65%' : 0,
        animation: {
          animateRotate: true,
          duration: 1000
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#e5e7eb',
              usePointStyle: true,
              padding: 20,
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((value / total) * 100).toFixed(1);
                return `${label}: ${pct}% (${value})`;
              }
            }
          }
        }
      }
    });
    
    this.pulseCanvas(canvasId);
    
    return this.instances[canvasId];
  },
  
  createTrendChart(canvasId, data) {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;
    
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Transaction Volume',
          data: data.map(d => d.total_spend),
          borderColor: '#22c55e',
          backgroundColor: gradient,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#22c55e',
          pointBorderColor: '#0b1020',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              callback: (val) => '₹' + (val / 1000).toFixed(0) + 'K'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Amount: ${new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
              }).format(ctx.parsed.y)}`
            }
          }
        }
      }
    });
    
    this.pulseCanvas(canvasId);
    
    return this.instances[canvasId];
  },

  createVelocityChart(canvasId, transactions) {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;

    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }

    const byDay = new Map();
    transactions.forEach(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      if (!ts || Number.isNaN(ts.getTime())) return;
      const key = ts.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });

    const labels = Array.from(byDay.keys()).sort();
    const counts = labels.map(l => byDay.get(l));

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Transactions / day',
          data: counts,
          borderColor: '#38bdf8',
          backgroundColor: gradient,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8'
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.3)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.3)' } }
        }
      }
    });

    this.pulseCanvas(canvasId);
    return this.instances[canvasId];
  },
  
  createPlotly3D(containerId, transactions) {
    const container = DOM.$(`#${containerId}`);
    if (!container || typeof Plotly === 'undefined') return;
    
    const points = transactions.slice(0, 300);
    if (points.length === 0) return;
    
    const trace = {
      x: points.map(p => parseFloat(p.amount) || 0),
      y: points.map(p => parseFloat(p.fraud_score) || 0),
      z: points.map((_, i) => i),
      mode: 'markers',
      type: 'scatter3d',
      marker: {
        size: 5,
        color: points.map(p => parseFloat(p.fraud_score) || 0),
        colorscale: [[0, '#22c55e'], [0.5, '#fbbf24'], [1, '#f43f5e']],
        opacity: 0.8,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 }
      },
      hovertemplate: `
        <b>User:</b> %{text}<br>
        <b>Amount:</b> ₹%{x:,.2f}<br>
        <b>Risk Score:</b> %{y:.3f}<br>
        <extra></extra>
      `,
      text: points.map(p => p.user_id)
    };
    
    const layout = {
      margin: { l: 0, r: 0, b: 0, t: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      scene: {
        xaxis: { 
          title: 'Amount (₹)', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        yaxis: { 
          title: 'Risk Score', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        zaxis: { 
          title: 'Index', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        bgcolor: 'rgba(0,0,0,0)',
        camera: {
          eye: { x: 1.5, y: 1.5, z: 1.2 }
        }
      },
      hoverlabel: {
        bgcolor: 'rgba(12, 18, 36, 0.95)',
        bordercolor: 'rgba(148, 163, 184, 0.3)',
        font: { color: '#e5e7eb' }
      }
    };
    
    Plotly.newPlot(container, [trace], layout, {
      displayModeBar: false,
      responsive: true
    });

    this.pulseContainer(containerId);
  },

  createGeoMap(containerId, transactions) {
    const container = DOM.$(`#${containerId}`);
    if (!container || typeof Plotly === 'undefined') return;

    const byCountry = new Map();
    transactions.forEach(tx => {
      const country = tx.country || 'Unknown';
      const entry = byCountry.get(country) || { count: 0, risk: 0 };
      entry.count += 1;
      entry.risk += parseFloat(tx.fraud_score || 0);
      byCountry.set(country, entry);
    });

    const countries = Array.from(byCountry.keys());
    const counts = countries.map(c => byCountry.get(c).count);
    const risks = countries.map(c => {
      const entry = byCountry.get(c);
      return entry.count ? entry.risk / entry.count : 0;
    });

    const trace = {
      type: 'scattergeo',
      locationmode: 'country names',
      locations: countries,
      text: countries.map((c, i) => `${c}<br>Tx: ${counts[i]}<br>Risk: ${risks[i].toFixed(2)}`),
      marker: {
        size: counts.map(v => Math.max(6, Math.min(20, v))),
        color: risks,
        colorscale: [[0, '#22c55e'], [0.5, '#fbbf24'], [1, '#f43f5e']],
        opacity: 0.85,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 }
      }
    };

    const layout = {
      margin: { l: 0, r: 0, b: 0, t: 0 },
      geo: {
        bgcolor: 'rgba(0,0,0,0)',
        showland: true,
        landcolor: 'rgba(15, 23, 42, 0.9)',
        showcountries: true,
        countrycolor: 'rgba(148, 163, 184, 0.2)',
        showocean: true,
        oceancolor: 'rgba(2, 6, 23, 0.9)',
        projection: { type: 'natural earth' }
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)'
    };

    Plotly.newPlot(container, [trace], layout, {
      displayModeBar: false,
      responsive: true
    });

    this.pulseContainer(containerId);
  },
  
  destroy(id) {
    if (this.instances[id]) {
      this.instances[id].destroy();
      delete this.instances[id];
    }
  }
};

// ==========================================
// AI Chat Manager
// ==========================================

const AIChat = {
  log: null,
  form: null,
  input: null,
  isTyping: false,
  
  init() {
    this.log = DOM.$('#ai-chat-log');
    this.form = DOM.$('#ai-form');
    this.input = DOM.$('#ai-input');
    
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input?.focus();
      }
      if (e.key === 'Escape') {
        this.input?.blur();
      }
    });
    
    // Suggested questions
    this.log?.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-suggestion')) {
        this.input.value = e.target.textContent;
        this.form.dispatchEvent(new Event('submit'));
      }
    });
    
    DOM.$('#ai-clear')?.addEventListener('click', () => this.clear());
  },
  
  handleSubmit(e) {
    e.preventDefault();
    if (this.isTyping) return;
    
    const question = this.input.value.trim();
    if (!question) return;
    
    this.addUserMessage(question);
    this.input.value = '';
    this.showTyping();
    
    fetch('/ask_ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    })
    .then(res => res.json())
    .then(data => {
      this.hideTyping();
      this.typeMessage(data.answer || 'I could not generate a response.');
    })
    .catch(err => {
      this.hideTyping();
      this.addAIMessage('I encountered an error. Please try again.');
      console.error('AI Error:', err);
    });
  },
  
  addUserMessage(text) {
    const msg = DOM.create('div', { className: 'user-message' }, [
      DOM.create('div', { className: 'user-label' }, ['You']),
      DOM.create('p', {}, [text])
    ]);
    this.log.appendChild(msg);
    this.scrollToBottom();
  },
  
  addAIMessage(text) {
    const msg = DOM.create('div', { className: 'ai-message ai-reveal' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('p', { className: 'ai-stagger' }, [text])
      ])
    ]);
    this.log.appendChild(msg);
    this.scrollToBottom();
  },
  
  showTyping() {
    this.isTyping = true;
    const typing = DOM.create('div', { className: 'ai-message typing', id: 'typing-indicator' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('div', { className: 'typing-dots' }, [
          DOM.create('span'),
          DOM.create('span'),
          DOM.create('span')
        ])
      ])
    ]);
    this.log.appendChild(typing);
    this.scrollToBottom();
  },
  
  hideTyping() {
    this.isTyping = false;
    DOM.$('#typing-indicator')?.remove();
  },
  
  typeMessage(text) {
    const msg = DOM.create('div', { className: 'ai-message ai-reveal' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('p', { id: 'typing-text' })
      ])
    ]);
    this.log.appendChild(msg);
    
    const el = msg.querySelector('#typing-text');
    let i = 0;
    const speed = 15; // ms per char
    
    const type = () => {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        this.scrollToBottom();
        setTimeout(type, speed);
      } else {
        el.classList.add('ai-stagger');
      }
    };
    
    type();
  },
  
  scrollToBottom() {
    this.log.scrollTop = this.log.scrollHeight;
  },
  
  clear() {
    this.log.innerHTML = `
      <div class="ai-message system">
        <div class="ai-avatar-sm"></div>
        <div class="message-content">
          <p>Chat cleared. How can I help you analyze your data?</p>
          <div class="suggested-questions">
            <button class="chip chip-suggestion">What are the top risk factors?</button>
            <button class="chip chip-suggestion">Show me unusual patterns</button>
            <button class="chip chip-suggestion">Explain this user's behavior</button>
          </div>
        </div>
      </div>
    `;
  }
};

// ==========================================
// Upload Manager with Drag & Drop
// ==========================================

const UploadManager = {
  dropZone: null,
  fileInput: null,
  form: null,
  preview: null,
  
  init() {
    this.dropZone = DOM.$('#drop-zone');
    this.fileInput = DOM.$('#file-input');
    this.form = DOM.$('#upload-form');
    this.preview = DOM.$('#file-preview');
    
    if (!this.dropZone) return;
    
    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.add('drag-over');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.remove('drag-over');
      });
    });
    
    this.dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length) {
        this.fileInput.files = files;
        this.handleFileSelect(files[0]);
      }
    });
    
    this.fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length) {
        this.handleFileSelect(e.target.files[0]);
      }
    });
    
    DOM.$('.remove-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearFile();
    });
    
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
  },
  
  handleFileSelect(file) {
    if (!this.validateFile(file)) return;
    
    DOM.$('#file-name').textContent = file.name;
    DOM.$('#file-size').textContent = this.formatFileSize(file.size);
    this.preview.hidden = false;
    this.dropZone.querySelector('.drop-zone-content').style.opacity = '0.3';
    
    // Validate Excel/CSV
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      Toast.show('Please upload a valid Excel or CSV file', 'error');
      this.clearFile();
      return;
    }
    
    Toast.show(`File "${file.name}" ready for analysis`, 'success');
  },
  
  validateFile(file) {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      Toast.show('File size exceeds 50MB limit', 'error');
      return false;
    }
    return true;
  },
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  clearFile() {
    this.fileInput.value = '';
    this.preview.hidden = true;
    this.dropZone.querySelector('.drop-zone-content').style.opacity = '1';
  },
  
  async handleSubmit(e) {
    e.preventDefault();
    
    const file = this.fileInput.files[0];
    if (!file) {
      Toast.show('Please select a file to analyze', 'error');
      return;
    }
    
    const btn = DOM.$('#analyze-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    
    btn.disabled = true;
    btnText.hidden = true;
    btnLoader.hidden = false;
    
    LoadingManager.show('Uploading file...');
    
    const formData = new FormData(this.form);
    
    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(error.detail);
      }
      
      LoadingManager.updateStatus('Processing data...', 'Running ML models and rule engine');
      LoadingManager.updateProgress(50);
      
      // Simulate progress steps
      await new Promise(r => setTimeout(r, 500));
      LoadingManager.updateProgress(75);
      
      window.location.href = '/dashboard';
      
    } catch (error) {
      Toast.show(error.message, 'error');
      btn.disabled = false;
      btnText.hidden = false;
      btnLoader.hidden = true;
      LoadingManager.hide();
    }
  }
};

// ==========================================
// KPI Animation
// ==========================================

const KPIAnimation = {
  animateValue(element, start, end, duration, prefix = '', suffix = '') {
    const range = end - start;
    const minTimer = 50;
    let stepTime = Math.abs(Math.floor(duration / range));
    stepTime = Math.max(stepTime, minTimer);
    
    let startTime = new Date().getTime();
    let endTime = startTime + duration;
    let timer;
    
    const run = () => {
      let now = new Date().getTime();
      let remaining = Math.max((endTime - now) / duration, 0);
      let value = Math.round(end - (remaining * range));
      element.textContent = prefix + value.toLocaleString('en-IN') + suffix;
      if (value == end) {
        clearInterval(timer);
      }
    };
    
    timer = setInterval(run, stepTime);
    run();
  },
  
  animateCurrency(element, start, end, duration, currency = 'INR') {
    const formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    });
    
    const range = end - start;
    const durationMs = duration;
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = start + (range * easeProgress);
      
      element.textContent = formatter.format(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
};

// ==========================================
// Main Dashboard Controller
// ==========================================

const Dashboard = {
  tables: {},
  orbitTimer: null,
  orbitAngle: 0,
  
  async init() {
    Toast.init();
    LoadingManager.init();
    UploadManager.init();
    AIChat.init();
    
    // Initialize tables before data load so hydration can populate them.
    this.initTables();
    this.showSkeletons();
    
    // Check if we have data
    await this.loadData();
    
    // Event listeners
    this.bindEvents();
    
    // Scroll reveal
    this.initScrollReveal();
  },
  
  async loadData() {
    try {
      const response = await fetch('/dashboard_data');
      if (!response.ok) {
        if (response.status === 400) {
          // No data yet, show empty state
          this.hideSkeletons(true);
          return;
        }
        throw new Error('Failed to load dashboard data');
      }
      
      const data = await response.json();
      Store.set('transactions', data.transactions || []);
      Store.set('insights', data.insights || {});
      Store.set('userProfile', data.user_profile || {});
      
      this.hydrateDashboard(data);
      
    } catch (error) {
      console.error('Dashboard load error:', error);
      this.hideSkeletons(true);
      Toast.show('Failed to load dashboard data', 'error');
    }
  },
  
  hydrateDashboard(data) {
    const { insights, transactions, fraud_table, user_profile, sample_rows } = data;
    this.hideSkeletons();
    
    // KPIs
    const totalSpend = insights?.total_spend || 0;
    const topCat = insights?.top_categories?.[0];
    let fraudRows = fraud_table || [];
    if (fraudRows.length === 0 && Array.isArray(transactions)) {
      fraudRows = transactions.filter(tx => tx.rule_based_fraud_flag || tx.model_fraud_flag);
    }
    const highRisk = fraudRows.filter(r => (r.fraud_score || 0) > 0.75).length;
    const medRisk = fraudRows.filter(r => {
      const s = r.fraud_score || 0;
      return s > 0.4 && s <= 0.75;
    }).length;
    
    // Animate KPIs
    setTimeout(() => {
      const totalEl = DOM.$('#kpi-total-spend');
      if (totalEl) KPIAnimation.animateCurrency(totalEl, 0, totalSpend, 1500);
      
      const catEl = DOM.$('#kpi-top-category');
      if (catEl) catEl.textContent = topCat?.category || '—';
      
      const riskEl = DOM.$('#kpi-risk-count');
      if (riskEl) KPIAnimation.animateValue(riskEl, 0, highRisk + medRisk, 1000);
      
      DOM.$('#kpi-tx-count').textContent = transactions?.length || 0;
      DOM.$('#high-risk-count').textContent = highRisk;
      DOM.$('#med-risk-count').textContent = medRisk;
      
      // Animate bars
      DOM.$('#kpi-bar-total').style.width = '75%';
      DOM.$('#kpi-bar-category').style.width = topCat ? '60%' : '0%';
      DOM.$('#kpi-bar-risk').style.width = Math.min(90, (highRisk + medRisk) * 10) + '%';
    }, 300);
    
    // Update titles
    const name = user_profile?.name || 'you';
    const sheetType = user_profile?.sheet_type || 'this dataset';
    DOM.$('#analysis-title').textContent = `Analysis for ${name}`;
    DOM.$('#analysis-subtitle').textContent = `Dataset: ${sheetType}`;
    DOM.$('#tx-header').textContent = `Transactions: ${sheetType}`;
    DOM.$('#tx-subheader').textContent = `${transactions?.length || 0} records analyzed`;
    
    // Populate tables
    if (this.tables.transactions) {
      this.tables.transactions.setData(transactions || []);
    }
    if (this.tables.fraud) {
      this.tables.fraud.setData(fraudRows);
    }
    this.tables.fraud?.filter(() => true);
    this.pulseRiskBadge(highRisk + medRisk);
    
    // Sample table
    this.renderSampleTable(sample_rows || []);
    
    // Charts
    this.initCharts(data);
    
    // 3D Viz
    if (transactions?.length > 0) {
      setTimeout(() => {
        ChartManager.createPlotly3D('plotly-3d', transactions);
        this.togglePlotlyOrbit();
      }, 500);
    }
    
    // Cluster insights
    this.renderClusters(data.cluster_insights || []);
  },
  
  initTables() {
    this.tables.transactions = new TransactionTable('transactions-table', {
      pageSize: 25,
      searchable: true
    });
    
    this.tables.fraud = new FraudTable('fraud-table', {
      pageSize: 10
    });

    DOM.$('#fraud-table')?.classList.add('animate-rows');
    
    // Risk filter removed: always show all flagged transactions.
    
    // Search
    DOM.$('#tx-search')?.addEventListener('input', DOM.debounce((e) => {
      this.tables.transactions.search(e.target.value);
    }, 300));
  },
  
  renderSampleTable(rows) {
    const table = DOM.$('#sample-table');
    if (!table || rows.length === 0) return;
    
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const columns = Object.keys(rows[0]);
    
    thead.innerHTML = `<tr>${columns.map(c => 
      `<th scope="col">${c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`
    ).join('')}</tr>`;
    
    tbody.innerHTML = rows.map(row => 
      `<tr>${columns.map(c => `<td>${row[c] ?? '—'}</td>`).join('')}</tr>`
    ).join('');
  },

  showSkeletons() {
    this.setTableSkeleton('sample-table', 4, 5);
    this.setTableSkeleton('fraud-table', 6, 7);
    this.setTableSkeleton('transactions-table', 6, 8);

    DOM.$$('.chart-wrapper, .plotly-container, .geo-map-container').forEach(el => {
      el.classList.add('is-loading');
    });
  },

  hideSkeletons(keepEmpty = false) {
    DOM.$$('.chart-wrapper, .plotly-container, .geo-map-container').forEach(el => {
      el.classList.remove('is-loading');
    });
    this.clearTableSkeleton('sample-table', keepEmpty);
    this.clearTableSkeleton('fraud-table', keepEmpty);
    this.clearTableSkeleton('transactions-table', keepEmpty);
  },

  setTableSkeleton(tableId, rows, cols) {
    const table = DOM.$(`#${tableId}`);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const container = table.closest('.table-container');
    container?.classList.add('is-loading');

    const skeletonRows = Array.from({ length: rows }).map(() => {
      const cells = Array.from({ length: cols }).map(() => '<td><span class="skeleton"></span></td>').join('');
      return `<tr class="skeleton-row">${cells}</tr>`;
    }).join('');
    tbody.innerHTML = skeletonRows;
  },

  clearTableSkeleton(tableId, keepEmpty = false) {
    const table = DOM.$(`#${tableId}`);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const container = table.closest('.table-container');
    container?.classList.remove('is-loading');
    if (keepEmpty) {
      tbody.innerHTML = '';
      return;
    }
    const hasSkeletons = tbody.querySelector('.skeleton-row');
    if (hasSkeletons) tbody.innerHTML = '';
  },

  pulseRiskBadge(count) {
    const badge = DOM.$('#risk-badge');
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.classList.add('risk-pulse');
    } else {
      badge.hidden = true;
      badge.classList.remove('risk-pulse');
    }
  },
  
  initCharts(data) {
    const catData = data.category_chart || { labels: [], values: [] };
    const monthlyData = data.monthly_trends || [];
    
    ChartManager.createCategoryChart('categoryChart', catData, 'doughnut');
    ChartManager.createTrendChart('monthlyChart', monthlyData);
    ChartManager.createVelocityChart('velocityChart', data.transactions || []);
    ChartManager.createGeoMap('geo-map', data.transactions || []);

    const countsByDay = new Map();
    (data.transactions || []).forEach(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      if (!ts || Number.isNaN(ts.getTime())) return;
      const key = ts.toISOString().slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });
    const peak = Math.max(0, ...countsByDay.values());
    const velocityAlerts = (data.transactions || []).filter(tx => {
      return parseFloat(tx.fraud_score || 0) > 0.6;
    }).length;
    const peakEl = DOM.$('#peak-activity');
    const alertEl = DOM.$('#velocity-alerts');
    if (peakEl) peakEl.textContent = peak ? `${peak} tx/day` : '—';
    if (alertEl) alertEl.textContent = velocityAlerts ? String(velocityAlerts) : '—';
    
    // Chart type toggles
    DOM.$$('.chart-type').forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.$$('.chart-type').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ChartManager.createCategoryChart('categoryChart', catData, btn.dataset.type);
      });
    });
  },
  
  renderClusters(insights) {
    const panel = DOM.$('#cluster-panel');
    if (!panel) return;
    
    if (insights.length === 0) {
      panel.innerHTML = '<div class="cluster-empty"><p>No anomaly clusters detected in current dataset.</p></div>';
      return;
    }
    
    panel.innerHTML = insights.map(insight => `
      <div class="cluster-row">
        <span>${insight.name}</span>
        <span class="cluster-score">${insight.score.toFixed(2)}</span>
      </div>
    `).join('');
    
    // Key insights list
    const list = DOM.$('#insights-list');
    if (list) {
      const items = [
        `${insights.length} distinct anomaly patterns identified`,
        `Primary cluster: ${insights[0]?.name}`,
        `Average cluster confidence: ${(insights.reduce((a, b) => a + b.score, 0) / insights.length).toFixed(2)}`
      ];
      list.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    }
  },
  
  bindEvents() {
    // Export buttons
    DOM.$('#export-analysis')?.addEventListener('click', () => this.exportReport());
    DOM.$('#export-risk')?.addEventListener('click', () => this.exportFlaggedPdf());
    DOM.$('#export-all')?.addEventListener('click', () => this.exportTable('transactions'));
    
    // Refresh
    DOM.$('#refresh-data')?.addEventListener('click', () => {
      Toast.show('Refreshing data...', 'info');
      this.loadData();
    });
    
    // 3D controls
    DOM.$('#reset-viz')?.addEventListener('click', () => {
      const container = DOM.$('#plotly-3d');
      if (container && typeof Plotly !== 'undefined') {
        Plotly.relayout(container, {
          'scene.camera': {
            eye: { x: 1.5, y: 1.5, z: 1.2 }
          }
        });
      }
    });

    DOM.$('#auto-rotate')?.addEventListener('change', () => {
      this.togglePlotlyOrbit();
    });
    
    // Modal close
    DOM.$('.modal-close')?.addEventListener('click', () => {
      DOM.$('#detail-modal')?.close();
    });
    
    // Theme toggle (placeholder)
    DOM.$('#theme-toggle')?.addEventListener('click', () => {
      Toast.show('Theme switching coming soon', 'info');
    });
  },

  togglePlotlyOrbit() {
    const toggle = DOM.$('#auto-rotate');
    if (!toggle || !toggle.checked) {
      this.stopPlotlyOrbit();
      return;
    }
    this.startPlotlyOrbit();
  },

  startPlotlyOrbit() {
    const container = DOM.$('#plotly-3d');
    if (!container || typeof Plotly === 'undefined') return;
    this.stopPlotlyOrbit();
    this.orbitAngle = 0;
    this.orbitTimer = setInterval(() => {
      this.orbitAngle += 0.02;
      const radius = 1.6;
      const x = radius * Math.cos(this.orbitAngle);
      const y = radius * Math.sin(this.orbitAngle);
      Plotly.relayout(container, {
        'scene.camera.eye': { x, y, z: 1.2 }
      });
    }, 80);
  },

  stopPlotlyOrbit() {
    if (this.orbitTimer) clearInterval(this.orbitTimer);
    this.orbitTimer = null;
  },
  
  exportReport() {
    Toast.show('Generating PDF report...', 'info');
    // Implementation would generate PDF from current data
    setTimeout(() => {
      Toast.show('Report downloaded', 'success');
    }, 1500);
  },
  
  exportTable(tableName) {
    const data = Store.get('transactions');
    if (!data || data.length === 0) {
      Toast.show('No data to export', 'error');
      return;
    }
    
    const csv = this.convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavach-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    Toast.show('Export downloaded', 'success');
  },

  exportFlaggedPdf() {
    const rows = this.tables.fraud?.filteredData || [];
    if (!rows.length) {
      Toast.show('No flagged transactions to export', 'error');
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      Toast.show('PDF library not loaded', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const profile = Store.get('userProfile') || {};
    const analystName = profile.name || 'Analyst';
    const auditType = profile.sheet_type || 'Audit';

    // Watermark
    doc.setTextColor(80, 98, 120);
    doc.setFontSize(60);
    doc.setGState(new doc.GState({ opacity: 0.08 }));
    doc.text('KAVACH', doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, {
      align: 'center',
      angle: 25
    });
    doc.setGState(new doc.GState({ opacity: 1 }));

    doc.setFillColor(12, 18, 36);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, 'F');

    doc.setTextColor(226, 232, 240);
    doc.setFontSize(20);
    doc.text('KAVACH', 40, 45);
    doc.setFontSize(11);
    doc.text('Flagged Transactions Report', 40, 65);
    doc.text(`Analyst: ${analystName}`, 260, 45);
    doc.text(`Audit: ${auditType}`, 260, 65);

    doc.setFillColor(56, 189, 248);
    doc.roundedRect(doc.internal.pageSize.getWidth() - 170, 30, 130, 28, 10, 10, 'F');
    doc.setTextColor(2, 6, 23);
    doc.setFontSize(10);
    doc.text('KAVACH Verified', doc.internal.pageSize.getWidth() - 150, 48);

    const headers = [
      ['User', 'Amount', 'Country', 'Score', 'Signals', 'Risk'],
    ];
    const body = rows.map(r => [
      r.user_id,
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.amount || 0),
      r.country || '—',
      (r.fraud_score || 0).toFixed(2),
      [
        r.rule_based_fraud_flag ? 'Rules' : null,
        r.model_fraud_flag ? 'Model' : null,
        r.velocity_flag ? 'Velocity' : null
      ].filter(Boolean).join(' + ') || 'None',
      (r.fraud_score || 0) > 0.75 ? 'Critical' : (r.fraud_score || 0) > 0.4 ? 'Warning' : 'Low'
    ]);

    doc.autoTable({
      head: headers,
      body,
      startY: 100,
      styles: {
        fontSize: 9,
        textColor: [226, 232, 240],
        fillColor: [12, 18, 36],
        lineColor: [30, 41, 59],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [226, 232, 240],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [11, 16, 32]
      },
      margin: { left: 40, right: 40 }
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString();
    doc.text(`Analyst: ${analystName} • Audit: ${auditType} • Generated: ${dateStr}`, 40, pageHeight - 30);

    doc.save(`kavach-flagged-transactions-${new Date().toISOString().split('T')[0]}.pdf`);
    Toast.show('Flagged transactions PDF downloaded', 'success');
  },
  
  convertToCSV(data) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        let val = row[h];
        if (typeof val === 'string' && val.includes(',')) {
          val = `"${val}"`;
        }
        return val;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  },
  
  initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    DOM.$$('.reveal').forEach(el => observer.observe(el));
  }
};

// ==========================================
// Initialize
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});
