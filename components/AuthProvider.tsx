'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, getIdTokenResult, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type AuthContextType = {
  user: any | null;
  role: string;
  region: string[]; // Add region to the context as string array
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({ user: null, role: 'viewer', region: [], logout: async () => {} });

export const AuthProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<string>('loading');
  const [region, setRegion] = useState<string[]>([]); // Add region state as string array

  useEffect(() => {
    console.log('🟢 AuthProvider mounted');

    return onAuthStateChanged(auth, async (u) => {
      console.log('🟡 onAuthStateChanged triggered:', u);

      setUser(u);

      if (u) {
        console.log('🟢 User detected:', u);
        try {
          const idTokenResult = await getIdTokenResult(u);
          console.log('🟢 Token claims successfully fetched:', idTokenResult.claims);

          const claimsRole = idTokenResult.claims.role as string | undefined;
          // Support both "regions" and legacy "region" claim keys
          const claimsRegionRaw = (idTokenResult.claims.regions ?? idTokenResult.claims.region) as string | string[] | undefined;

          if (claimsRole) {
            setRole(claimsRole);
            console.log(`🟢 Role found and set from claims: ${claimsRole}`);
          } else {
            console.warn('🟡 No role found in token claims. Setting role as pending.');
            setRole('pending');
            console.log('🟡 Role missing, set to pending');
          }

          if (claimsRegionRaw) {
            console.log('🟢 Raw region claim value:', claimsRegionRaw);
            let normalizedRegions: string[];
            if (typeof claimsRegionRaw === 'string') {
              normalizedRegions = claimsRegionRaw.split(',').map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(claimsRegionRaw)) {
              normalizedRegions = claimsRegionRaw;
            } else {
              normalizedRegions = [];
            }
            setRegion(normalizedRegions); // Set region from claims as string array
            console.log(`🟢 Region found and set from claims: ${normalizedRegions}`);
          } else {
            console.warn('🟡 No region found in token claims. Setting region as default.');
            setRegion([]); // Set region to empty array if not found
          }
        } catch (error) {
          console.error('🔴 Error fetching token claims:', error);
          setRole('unapproved');
          setRegion([]); // Set region to empty array in case of error
          console.log('🔴 Set role to unapproved and region to default due to error while fetching token claims');
        }
      } else {
        console.log('🟡 No user detected, setting role and region to unapproved/default');
        setRole('unapproved');
        setRegion([]); // Set region to empty array if no user is detected
      }
    });
  }, []);

  const logout = () => signOut(auth);

  if (role === 'loading') {
    return (
      <div className="w-full h-screen flex flex-col justify-center items-center bg-gradient-to-br from-white via-blue-50 to-blue-100 animate-fade-in">
        <img
          src="/logo-transparent.png"
          alt="로고"
          className="w-28 h-28 mb-6 object-contain animate-fade-in-scale"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
        <p className="text-xl font-medium text-gray-700 mb-2">로딩 중입니다</p>
        <p className="text-sm text-gray-500">데이터를 불러오고 있어요. 잠시만 기다려 주세요.</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, role, region, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);