'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme, selectedSymbol } = useApp();
  const [openPositionsCount, setOpenPositionsCount] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;
    const fetchPositionsCount = async () => {
      try {
        const res = await fetch('/api/v1/paper/positions');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setOpenPositionsCount(Array.isArray(data) ? data.length : 0);
        }
      } catch (e) {
        // ignore background poll error
      }
    };

    fetchPositionsCount();
    const interval = setInterval(fetchPositionsCount, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const navLinks = [
    {
      name: 'Setup',
      href: '/',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      ),
    },
    {
      name: 'Charts',
      href: '/charts',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
      ),
    },
    {
      name: 'Positions',
      href: '/positions',
      badge: openPositionsCount,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        </svg>
      ),
    },
    {
      name: 'Debate',
      href: '/debate',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      ),
    },
    {
      name: 'Backtest',
      href: '/backtest',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
          <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
      ),
    },
    {
      name: 'Reliability',
      href: '/reliability',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <polyline points="9 12 11 14 15 10"></polyline>
        </svg>
      ),
    },
    {
      name: 'Archive',
      href: '/archive',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="21 8 21 21 3 21 3 8"></polyline>
          <rect x="1" y="3" width="22" height="5"></rect>
          <line x1="10" y1="12" x2="14" y2="12"></line>
        </svg>
      ),
    },
  ];

  const isLinkActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop Sidebar (208px wide) */}
      <aside
        className="sidebar-desktop"
        style={{
          width: '208px',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 40,
        }}
      >
        {/* Brand / Logo */}
        <div
          style={{
            height: '56px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-contrast)',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            T
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            TradingAgents
          </span>
        </div>

        {/* Navigation list */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navLinks.map((link) => {
            const active = isLinkActive(link.href);
            return (
              <Link
                key={link.href}
                href={selectedSymbol ? `${link.href}?symbol=${selectedSymbol}` : link.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '9px 12px',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  backgroundColor: active ? 'var(--amber-bg)' : 'transparent',
                  border: active ? '1px solid var(--amber-border)' : '1px solid transparent',
                  borderRadius: 'var(--radius-input)',
                  textDecoration: 'none',
                }}
              >
                <span style={{ color: active ? 'var(--accent)' : 'var(--muted)', display: 'flex' }}>
                  {link.icon}
                </span>
                <span>{link.name}</span>
                {link.badge > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      backgroundColor: 'var(--accent)',
                      color: '#000000',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle & Status Footer */}
        <div
          style={{
            padding: '16px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Theme</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
              {theme} mode
            </span>
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle light and dark theme"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="tabbar-mobile"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 40,
        }}
      >
        {navLinks.map((link) => {
          const active = isLinkActive(link.href);
          return (
            <Link
              key={link.href}
              href={selectedSymbol ? `${link.href}?symbol=${selectedSymbol}` : link.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--accent)' : 'var(--muted)',
                textDecoration: 'none',
                padding: '6px 12px',
              }}
            >
              <div style={{ position: 'relative', display: 'flex' }}>
                {link.icon}
                {link.badge > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-8px',
                      backgroundColor: 'var(--accent)',
                      color: '#000000',
                      fontSize: '9px',
                      fontWeight: 800,
                      padding: '0 4px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {link.badge}
                  </span>
                )}
              </div>
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx global>{`
        @media (max-width: 768px) {
          .sidebar-desktop {
            display: none !important;
          }
          .tabbar-mobile {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
