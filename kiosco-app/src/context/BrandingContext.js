import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { createTheme, DEFAULT_BRANDING, normalizeHexColor } from '../theme/theme';

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  theme: createTheme(DEFAULT_BRANDING),
  loading: true
});

function normalizeBranding(data = {}) {
  return {
    storeName: String(data.storeName || DEFAULT_BRANDING.storeName).trim() || DEFAULT_BRANDING.storeName,
    storeTagline: String(data.storeTagline || DEFAULT_BRANDING.storeTagline).trim() || DEFAULT_BRANDING.storeTagline,
    storeLogoUrl: /^https?:\/\//i.test(String(data.storeLogoUrl || '').trim())
      ? String(data.storeLogoUrl).trim()
      : '',
    storeEmoji: String(data.storeEmoji || DEFAULT_BRANDING.storeEmoji).trim() || DEFAULT_BRANDING.storeEmoji,
    accentColor: normalizeHexColor(data.accentColor)
  };
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reference = doc(db, 'config', 'theme');
    return onSnapshot(
      reference,
      snapshot => {
        setBranding(normalizeBranding(snapshot.exists() ? snapshot.data() : {}));
        setLoading(false);
      },
      error => {
        console.warn('No se pudo sincronizar la apariencia:', error?.message || error);
        setLoading(false);
      }
    );
  }, []);

  const value = useMemo(() => ({
    branding,
    theme: createTheme(branding),
    loading
  }), [branding, loading]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
