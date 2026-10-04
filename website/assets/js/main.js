/**
 * Ivy Assistant Bot - Main JavaScript Interactivity
 * Includes Light/Dark Mode Toggle, Mobile Sidebar, ScrollSpy, Search & Copy
 */

// 1. Inisialisasi Tema Gelap/Terang
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  updateThemeIcon(currentTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      document.documentElement.setAttribute('data-bs-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }
}

function updateThemeIcon(theme) {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  if (theme === 'dark') {
    themeToggle.innerHTML = '<i class="fa-solid fa-sun text-warning"></i>';
    themeToggle.setAttribute('title', 'Beralih ke mode terang');
    themeToggle.setAttribute('aria-label', 'Beralih ke mode terang');
  } else {
    themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    themeToggle.setAttribute('title', 'Beralih ke mode gelap');
    themeToggle.setAttribute('aria-label', 'Beralih ke mode gelap');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Inisialisasi Tema
  initTheme();

  // 2. Sidebar Toggler untuk Mobile
  const sidebarToggler = document.getElementById('docs-sidebar-toggler');
  const sidebar = document.getElementById('docs-sidebar');

  if (sidebarToggler && sidebar) {
    sidebarToggler.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('show');
    });

    // Tutup sidebar jika klik di luar pada mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth < 1200 && sidebar.classList.contains('show')) {
        if (!sidebar.contains(e.target) && e.target !== sidebarToggler) {
          sidebar.classList.remove('show');
        }
      }
    });

    // Tutup sidebar saat link diklik pada layar mobile
    const navLinks = sidebar.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 1200) {
          sidebar.classList.remove('show');
        }
      });
    });
  }

  // 3. Active Link on Scroll (ScrollSpy Sederhana)
  const sections = document.querySelectorAll('article section, article header');
  const navItems = document.querySelectorAll('.docs-nav .nav-link');

  function updateActiveNav() {
    let current = '';
    const scrollPos = window.scrollY + 100;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
        current = section.getAttribute('id');
      }
    });

    navItems.forEach((link) => {
      link.classList.remove('active');
      if (current && link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav);
  updateActiveNav();

  // 4. Live Search & Filter Tabel Cheatsheet
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchButton');
  const tableRows = document.querySelectorAll('#cheatsheetTable tbody tr');

  function performSearch() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (!query) {
      tableRows.forEach(row => (row.style.display = ''));
      return;
    }

    tableRows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });

    const cheatsheetSec = document.getElementById('item-cheatsheet');
    if (cheatsheetSec && query.length >= 2) {
      cheatsheetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', performSearch);
    if (searchBtn) {
      searchBtn.addEventListener('click', performSearch);
    }
  }

  // 5. Klik untuk Salin Command Bot (Click to Copy)
  const cmdBadges = document.querySelectorAll('.cmd-badge');
  cmdBadges.forEach(badge => {
    badge.setAttribute('title', 'Klik untuk menyalin perintah');
    badge.addEventListener('click', async () => {
      const text = badge.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        const originalText = badge.innerHTML;
        badge.innerHTML = `<i class="fas fa-check text-success"></i> Disalin!`;
        badge.style.borderColor = '#10b981';
        setTimeout(() => {
          badge.innerHTML = originalText;
          badge.style.borderColor = '';
        }, 1500);
      } catch (err) {
        console.error('Gagal menyalin:', err);
      }
    });
  });

  // 6. Update Tahun Otomatis di Footer
  const yearSpan = document.getElementById('currentYear');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});
