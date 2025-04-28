import dynamic from "next/dynamic";

// MapView를 클라이언트 사이드에서만 로드
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function HomePage() {
  return (
    <main className="w-full h-screen">
      <MapView />
    </main>
  );
}