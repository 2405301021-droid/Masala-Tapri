// Masala Tapri frontend: navigation, menu (from API), contact form (to API)
(function () {
  'use strict';

  // ---- Mobile navigation
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // ---- Menu: filter buttons (groups are looked up on click so API-rendered groups work)
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var cat = chip.getAttribute('data-filter');
      document.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      document.querySelectorAll('.menu-group').forEach(function (g) {
        g.hidden = !(cat === 'all' || g.getAttribute('data-cat') === cat);
      });
    });
  });

  // ---- Menu: load from GET /api/menu (static HTML stays as fallback if the API is unreachable)
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  var container = document.querySelector('.menu-group') && document.querySelector('.menu-group').parentNode;
  if (container) {
    fetch('/api/menu').then(function (r) {
      if (!r.ok) throw new Error('menu request failed');
      return r.json();
    }).then(function (menu) {
      var active = document.querySelector('.chip[aria-pressed="true"]');
      var current = active ? active.getAttribute('data-filter') : 'all';
      document.querySelectorAll('.menu-group').forEach(function (g) { g.remove(); });
      menu.categories.forEach(function (cat) {
        var group = el('div', 'menu-group');
        group.setAttribute('data-cat', cat.id);
        group.hidden = !(current === 'all' || current === cat.id);
        group.appendChild(el('h2', '', cat.title));
        cat.items.forEach(function (it) {
          var row = el('div', 'item');
          var left = document.createElement('div');
          var h3 = el('h3', '', it.name);
          if (it.tag) h3.appendChild(el('span', 'tag', it.tag));
          left.appendChild(h3);
          left.appendChild(el('p', '', it.description));
          row.appendChild(left);
          row.appendChild(el('span', 'price', '\u20B9' + it.price));
          group.appendChild(row);
        });
        container.appendChild(group);
      });
    }).catch(function () { /* keep the static menu already in the page */ });
  }

  // ---- Contact form: validate, then POST /api/contact
  var form = document.getElementById('contact-form');
  if (form) {
    var notice = document.getElementById('form-notice');
    var rules = {
      name: function (v) { return v.trim().length >= 2 ? '' : 'Enter your name (at least 2 characters).'; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address, like name@example.com.'; },
      message: function (v) { return v.trim().length >= 10 ? '' : 'Write a message of at least 10 characters.'; }
    };
    var check = function (field) {
      var input = form.elements[field];
      var msg = rules[field](input.value);
      document.getElementById(field + '-error').textContent = msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    };
    Object.keys(rules).forEach(function (f) {
      form.elements[f].addEventListener('blur', function () { check(f); });
    });
    var show = function (text, isError) {
      notice.textContent = text;
      notice.className = 'notice' + (isError ? ' notice--error' : '');
      notice.hidden = false;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = Object.keys(rules).map(check).every(Boolean);
      if (!ok) { var bad = form.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
      var payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        topic: form.elements.topic.value,
        message: form.elements.message.value.trim()
      };
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) {
            show('Thanks, ' + payload.name + '. We got your message and will reply to ' + payload.email + ' within a day.', false);
            form.reset();
          } else {
            show(res.body.error || 'Something went wrong. Please check the form.', true);
          }
        })
        .catch(function () { show('Could not reach the server. Please try again in a moment.', true); })
        .then(function () { button.disabled = false; });
    });
  }
})();
