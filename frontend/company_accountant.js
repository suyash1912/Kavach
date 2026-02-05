(() => {
  const $ = (s) => document.querySelector(s);

  const statusEl = $('#company-status');
  const form = $('#company-upload-form');
  const fileInput = $('#company-file-input');
  const preview = $('#company-file-preview');
  const fileName = $('#company-file-name');
  const fileSize = $('#company-file-size');
  const removeBtn = $('#company-remove-file');
  const downloadIssues = $('#download-issues');
  const downloadVerified = $('#download-verified');
  const downloadPdf = $('#download-pdf');
  const themeSelect = $('#theme-select');

  function applyTheme(theme) {
    const valid = new Set(['aurora-core', 'sweet-dark', 'dreamy', 'solar-copper']);
    const selected = valid.has(theme) ? theme : 'aurora-core';
    document.body.setAttribute('data-theme', selected);
    localStorage.setItem('kavach_theme', selected);
    if (themeSelect) themeSelect.value = selected;
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function showFile(file) {
    if (!file) return;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    preview.hidden = false;
    const content = $('#company-drop-zone .drop-zone-content');
    if (content) content.style.opacity = '0.3';
    statusEl.textContent = `Selected: ${file.name}. Click “Verify Statements”.`;
  }

  function clearFile() {
    fileInput.value = '';
    preview.hidden = true;
    const content = $('#company-drop-zone .drop-zone-content');
    if (content) content.style.opacity = '1';
    statusEl.textContent = 'Awaiting upload.';
  }

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) showFile(e.target.files[0]);
  });

  removeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    clearFile();
  });

  applyTheme(localStorage.getItem('kavach_theme') || 'aurora-core');
  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value));

  async function fetchReport() {
    const res = await fetch('/company_report');
    if (!res.ok) throw new Error('No report');
    return res.json();
  }

  async function renderReport() {
    const report = await fetchReport();
    $('#ca-revenue').textContent = formatCurrency(report.summary.revenue);
    $('#ca-expenses').textContent = formatCurrency(report.summary.expenses);
    $('#ca-profit').textContent = formatCurrency(report.summary.profit);
    $('#ca-verified').textContent = report.verified ? 'Verified' : 'Issues Found';

    $('#ca-trend').src = `data:image/png;base64,${report.charts.trend}`;
    $('#ca-pie').src = `data:image/png;base64,${report.charts.expenses_pie}`;

    const tbody = $('#ca-anomalies tbody');
    tbody.innerHTML = report.anomalies.length
      ? report.anomalies.map(a => `<tr><td>${a.row}</td><td>${a.field}</td><td>${a.issue}</td><td>${a.suggestion}</td></tr>`).join('')
      : '<tr><td colspan="4">No anomalies detected.</td></tr>';

    downloadVerified.disabled = !report.verified;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    statusEl.textContent = 'Uploading and verifying...';
    const res = await fetch('/company_upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      statusEl.textContent = err.detail || 'Upload failed';
      return;
    }
    statusEl.textContent = 'Verification complete.';
    await renderReport();
  });

  downloadIssues?.addEventListener('click', () => {
    window.location.href = '/company_report_excel?verified=false';
  });

  downloadVerified?.addEventListener('click', () => {
    window.location.href = '/company_report_excel?verified=true';
  });

  downloadPdf?.addEventListener('click', () => {
    window.location.href = '/company_report_pdf';
  });
})();
