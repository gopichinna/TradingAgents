'use client';

import React, { useState, useEffect } from 'react';
import { AppProvider } from '../context/AppContext';
import AppShell from '../components/AppShell';

export default function Providers({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AppProvider>
      <AppShell>
        {mounted ? children : <div style={{ minHeight: '80vh' }} />}
      </AppShell>
    </AppProvider>
  );
}
