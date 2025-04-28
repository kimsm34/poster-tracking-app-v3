'use client';
import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { AuthContext } from "@/components/AuthProvider";

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('🟢 RequireAuth mounted');
  const { user, role } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    console.log('🟡 useEffect triggered in RequireAuth');
    if (user === undefined) {
      console.log('🟡 User is undefined (loading)');
      return; // 아직 로딩 중이면 아무것도 안 함
    }

    if (user === null) {
      console.log('🔴 User is null (not logged in)');
    } else if (role === 'pending') {
      console.warn('🟡 User has pending role, redirecting to login');
    } else if (role === 'rejected') {
      console.warn('🔴 User has been rejected, redirecting to login');
    }

    if (user === null || role === 'pending' || role === 'rejected' || role === 'unapproved') {
      if (router.pathname !== '/login') {  
        console.log(`🔴 User not authorized (${user === null ? 'not logged in' : 'pending role'}). Redirecting to /login...`);
        console.log("🔵 current path:", router.asPath);
        const currentPath = router.asPath;
        const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}`;
        console.log("🔵 redirecting to:", redirectUrl);
        router.replace(redirectUrl);
      }
    }
  }, [user, role, router]);

  if (user === undefined || ((user === null || role === 'pending' || role === 'rejected') && router.pathname !== '/login')) {
    return null;
  }

  console.log('🟢 User authenticated, rendering children');
  return <>{children}</>;
};