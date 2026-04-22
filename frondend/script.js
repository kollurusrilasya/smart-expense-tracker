/* ============================================================
   FINIA — script.js — Auth page logic
   ============================================================ */

const API = 'http://localhost:3001/api';

/* ── Theme ── */
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

(function initTheme() {
  const saved = localStorage.getItem('finia_theme') || 'dark';
  html.setAttribute('data-theme', saved);
})();

themeToggle.addEventListener('click', () => {
  const curr = html.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('finia_theme', next);
});

/* ── Tabs ── */
const tabs = document.querySelectorAll('.tab-btn');
const tabContainer = document.querySelector('.auth-tabs');
const forms = document.querySelectorAll('.auth-form');

tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('.switch-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(link.dataset.switch);
  });
});

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  tabContainer.dataset.active = tabName;
  forms.forEach(f => {
    f.classList.toggle('active', f.dataset.form === tabName);
    if (f.dataset.form === tabName) {
      // Re-trigger animation
      f.style.animation = 'none';
      requestAnimationFrame(() => { f.style.animation = ''; });
    }
  });
}

/* ── Toast System ── */
function showToast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);

  const timer = setTimeout(() => removeToast(toast), duration);
  toast.addEventListener('click', () => { clearTimeout(timer); removeToast(toast); });
}

function removeToast(toast) {
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

/* ── Password Strength ── */
function checkStrength(pw) {
  const fill = document.getElementById('strengthFill');
  const label = document.getElementById('strengthLabel');

  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { pct: '0%', color: 'transparent', text: '' },
    { pct: '25%', color: '#EF4444', text: 'Weak' },
    { pct: '50%', color: '#F59E0B', text: 'Fair' },
    { pct: '75%', color: '#3B82F6', text: 'Good' },
    { pct: '100%', color: '#6EE7B7', text: 'Strong 🔥' },
  ];

  const level = levels[score];
  fill.style.width = level.pct;
  fill.style.background = level.color;
  label.textContent = level.text;
  label.style.color = level.color;
}

window.checkStrength = checkStrength;

/* ── Toggle Password Visibility ── */
function togglePw(btn) {
  const input = btn.parentElement.querySelector('input');
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.textContent = isText ? '👁' : '🙈';
}

window.togglePw = togglePw;

/* ── Validation Helpers ── */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function markInvalid(el) {
  el.classList.add('invalid');
  el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline';
  btn.querySelector('.btn-loader').classList.toggle('hidden', !loading);
}

/* ── Login ── */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');
  const btn      = document.getElementById('loginBtn');
  let valid = true;

  if (!validateEmail(email.value.trim())) { markInvalid(email); valid = false; }
  if (password.value.length < 1) { markInvalid(password); valid = false; }
  if (!valid) { showToast('Please fill in all fields correctly.', 'error'); return; }

  setLoading(btn, true);
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');

    localStorage.setItem('finia_token', data.token);
    localStorage.setItem('finia_user', JSON.stringify(data.user));
    showToast(`Welcome back, ${data.user.name}! 👋`, 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
});

/* ── Register ── */
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name     = document.getElementById('regName');
  const age      = document.getElementById('regAge');
  const gender   = document.getElementById('regGender');
  const country  = document.getElementById('regCountry');
  const email    = document.getElementById('regEmail');
  const password = document.getElementById('regPassword');
  const btn      = document.getElementById('registerBtn');

  let valid = true;
  const checks = [
    [!name.value.trim(),                         name],
    [isNaN(age.value) || age.value < 13 || age.value > 120, age],
    [!gender.value,                              gender],
    [!country.value,                             country],
    [!validateEmail(email.value.trim()),         email],
    [password.value.length < 8,                  password],
  ];

  checks.forEach(([fail, el]) => { if (fail) { markInvalid(el); valid = false; } });
  if (!valid) { showToast('Please complete all fields correctly.', 'error'); return; }

  // Check strength
  let score = 0;
  const pw = password.value;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score < 2) { showToast('Please choose a stronger password.', 'warning'); markInvalid(password); return; }

  setLoading(btn, true);
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        age: parseInt(age.value),
        gender: gender.value,
        country: country.value,
        email: email.value.trim(),
        password: password.value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');

    localStorage.setItem('finia_token', data.token);
    localStorage.setItem('finia_user', JSON.stringify(data.user));
    showToast(`Account created! Welcome, ${data.user.name}! 🎉`, 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
});