/**
 * KAVACH Landing Page JavaScript
 * Handles interactive elements, animations, and demo functionality
 */

(function () {
  'use strict';

  // Utility: Element selectors
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => document.body.classList.add('landing-ready'));
    initHeroAnimations();
    initTabs();
    initCarousel();
    initModals();
    initCounters();
    initScrollAnimations();
  });

  /**
   * Hero section animations
   */
  function initHeroAnimations() {
    const heroVisual = $('.hero-visual');
    if (!heroVisual) return;

    // Floating stats animation
    const floatingStats = heroVisual.querySelector('.floating-stats');
    if (floatingStats) {
      const progressLine = floatingStats.querySelector('.progress-line');
      if (progressLine) {
        // Animate progress line on scroll
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                progressLine.style.width = '100%';
                progressLine.style.transition = 'width 1.2s ease-out';
              }
            });
          },
          { threshold: 0.5 }
        );
        observer.observe(floatingStats);
      }
    }

    // Dashboard preview subtle pulse
    const previewBody = heroVisual.querySelector('.preview-body');
    if (previewBody) {
      previewBody.style.animation = 'pulse 3s ease-in-out infinite';
    }

    // Premium parallax on hero visual
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    let rafId = null;
    const dashboard = heroVisual.querySelector('.dashboard-preview');
    const floating = heroVisual.querySelector('.floating-stats');
    const handleMove = (e) => {
      if (!dashboard) return;
      const rect = heroVisual.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 6;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        dashboard.style.transform = `perspective(1000px) rotateY(${x}deg) rotateX(${-y}deg)`;
        if (floating) {
          floating.style.transform = `translate3d(${x * 2}px, ${-y * 2}px, 0)`;
        }
      });
    };
    heroVisual.addEventListener('mousemove', handleMove);
    heroVisual.addEventListener('mouseleave', () => {
      if (dashboard) dashboard.style.transform = 'perspective(1000px) rotateY(-5deg) rotateX(5deg)';
      if (floating) floating.style.transform = 'translate3d(0, 0, 0)';
    });
  }

  /**
   * Top navigation tabs behavior
   */
  function initTabs() {
    const tabs = $$('.top-tabs .tab-pill');
    const sections = ['features', 'how-it-works', 'pricing'];

    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const href = tab.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const targetId = href.substring(1);
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    // Highlight active tab on scroll
    const observerOptions = { threshold: 0.2 };
    sections.forEach((id) => {
      const section = document.getElementById(id);
      if (section) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const tab = document.querySelector(`.top-tabs .tab-pill[href="#${id}"]`);
            if (tab) {
              tab.classList.toggle('active', entry.isIntersecting);
            }
          });
        }, observerOptions);
        observer.observe(section);
      }
    });
  }

  /**
   * Testimonial carousel
   */
  function initCarousel() {
    const carousel = $('.testimonial-carousel');
    if (!carousel) return;

    const cards = $$('.testimonial-card');
    const dotsContainer = carousel.querySelector('.carousel-dots');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');

    let currentIndex = 0;

    // Create dots
    cards.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.setAttribute('aria-label', `Go to testimonial ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      dotsContainer.appendChild(dot);
    });

    const dots = $$('.dot');

    function updateCarousel() {
      cards.forEach((card, index) => {
        card.classList.toggle('active', index === currentIndex);
      });
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentIndex);
      });
    }

    function goToSlide(index) {
      currentIndex = (index + cards.length) % cards.length;
      updateCarousel();
    }

    prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
    nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));

    // Auto-advance every 8 seconds
    setInterval(() => goToSlide(currentIndex + 1), 8000);

    updateCarousel();
  }

  /**
   * Modal dialogs
   */
  function initModals() {
    const demoModal = $('#demo-modal');
    const noticeModal = $('#notice-modal');
    const watchDemoBtn = $('#watch-demo');
    const demoNoticeBtn = $('#demo-notice');
    const contactSalesBtn = $('#contact-sales');
    const scheduleDemoBtn = $('#schedule-demo');

    const openModal = (modal) => {
      if (modal && typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        // Fallback for browsers without dialog support
        modal.style.display = 'block';
        modal.setAttribute('open', '');
      }
    };

    const closeModal = (modal) => {
      if (modal && typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.style.display = 'none';
        modal.removeAttribute('open');
      }
    };

    // Event listeners
    if (watchDemoBtn) watchDemoBtn.addEventListener('click', () => openModal(demoModal));
    if (demoNoticeBtn) demoNoticeBtn.addEventListener('click', () => openModal(noticeModal));
    if (contactSalesBtn) contactSalesBtn.addEventListener('click', () => openModal(noticeModal));
    if (scheduleDemoBtn) scheduleDemoBtn.addEventListener('click', () => openModal(noticeModal));

    // Close on close button
    $$('.modal-close').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('dialog');
        closeModal(modal);
      });
    });

    // Close on backdrop click
    [demoModal, noticeModal].forEach((modal) => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal);
        }
      });
    });
  }

  /**
   * Animated counters (e.g., processing speed)
   */
  function initCounters() {
    const counters = $$('.counter');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-target'), 10);
            const duration = 1500;
            const start = performance.now();

            function animate(now) {
              const time = now - start;
              const progress = Math.min(time / duration, 1);
              const value = Math.floor(progress * target);
              el.textContent = value.toString();
              if (progress < 1) requestAnimationFrame(animate);
            }
            requestAnimationFrame(animate);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((counter) => observer.observe(counter));
  }

  /**
   * Scroll-triggered animations
   */
  function initScrollAnimations() {
    const fadeElements = $$('.feature-card, .step, .pricing-card, .testimonial-card');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.1 }
    );

    fadeElements.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });
  }

  /**
   * Accessibility: Skip link focus handling
   */
  (function initSkipLink() {
    const skipLink = document.querySelector('.skip-link');
    if (!skipLink) return;
    skipLink.addEventListener('click', () => {
      const target = document.querySelector(skipLink.getAttribute('href'));
      if (target) {
        target.focus({ preventScroll: false });
      }
    });
  })();

  /**
   * Utility: Debounce function for scroll events
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Expose utilities globally if needed
  window.KAVACH = window.KAVACH || {};
  window.KAVACH.debounce = debounce;
})();
