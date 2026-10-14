'use client';

import React, { Suspense } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RunProgressModal from './RunProgressModal';

export default function AppShell({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      {/* 208px Sidebar */}
      <Suspense fallback={<div style={{ width: '208px' }} />}>
        <Sidebar />
      </Suspense>

      {/* Main Content Area */}
      <div
        className="main-layout"
        style={{
          flex: 1,
          marginLeft: '208px',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Sticky TopBar */}
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>

        {/* Page Content Container */}
        <main
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '28px',
            boxSizing: 'border-box',
          }}
        >
          <Suspense fallback={<div style={{ padding: '40px', color: 'var(--muted)' }}>Loading view...</div>}>
            {children}
          </Suspense>
        </main>
      </div>

      {/* Global Run Progress Modal */}
      <Suspense fallback={null}>
        <RunProgressModal />
      </Suspense>

      <style jsx global>{`
        @media (max-width: 768px) {
          .main-layout {
            margin-left: 0 !important;
            padding-bottom: 70px !important;
          }
          main {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
