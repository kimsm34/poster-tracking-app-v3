// pages/map.tsx
import MapView from '@/components/MapView';
import { useRouter } from 'next/router';
import { useContext, useEffect } from 'react';
import { AuthContext } from '@/components/AuthProvider';

export default function MapPage() {
  const { user } = useContext(AuthContext);
  console.log('AuthContext user:', user);
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      console.log('User is not logged in, redirecting to login page...');
      router.push('/login');
    }
  }, [user]);

  if (user === null) {
    return null;
  }

  return <MapView />;
}