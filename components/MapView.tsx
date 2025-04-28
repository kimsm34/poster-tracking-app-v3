// components/MapView.tsx
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createMarker, MarkerData } from "@/lib/mapUtils";
import { db } from "@/lib/firebase";
import { getKakaoMapLink } from '@/lib/kakaoMapUtils';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from '@/components/AuthProvider';
import { handleDownloadPinsExcel } from '@/components/ExcelDownloader';
import { useRouter } from 'next/router';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';


// Firebase Storage 인스턴스
const storage = getStorage();

// 지원 상태 목록과 컬러 매핑
const statusList = [
  "설치전",
  "실사완료",
  "설치완료",
  "보수필요",
  "보수완료",
  "철거필요",
  "철거완료",
];
const statusColorMap: { [key: string]: string } = {
  "설치전": "gray",
  "실사완료": "yellow",
  "설치완료": "green",
  "보수필요": "red",
  "보수완료": "green",
  "철거필요": "red",
  "철거완료": "black",
};

// 요약 테이블 상태별 연한 배경 및 텍스트 색상 매핑
const summaryColorMap: { [key: string]: string } = {
  "설치전": "bg-gray-200 text-gray-800",
  "실사완료": "bg-yellow-200 text-gray-800",
  "설치완료": "bg-green-200 text-gray-800",
  "보수필요": "bg-red-200 text-gray-800",
  "보수완료": "bg-green-200 text-gray-800",
  "철거필요": "bg-red-200 text-gray-800",
  "철거완료": "bg-gray-700 text-white",
};

const photoLabelMap: { [key: string]: string } = {
  "설치전": "설치전(실사)",
  "보수 필요": "보수필요(전)",
  "보수완료": "보수완료(후)"
};

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface PinSummary {
  id: string;
  dong: string;
  region: string;
  status: string;
  hasMaintenanceRequest?: boolean;
  number?: number;
  addressNotFound?: boolean;
}

const MapView: React.FC = () => {
  // 다운로드 로딩 상태
  const [isDownloading, setIsDownloading] = useState(false);
  // 전체 이미지 다운로드 진행률 상태
  const [downloadProgressText, setDownloadProgressText] = useState('');
  // 역할 한글 매핑
  const roleLabelMap: { [key: string]: string } = {
    admin: "관리자",
    leader: "팀장",
    member: "팀원",
    election: "선관위",
  };
  const { user, role, region: userRegions } = useAuth();
  console.log('[MapView] Auth:', { uid: user?.uid, role, userRegions });
  console.log('[MapView] userRegions value:', userRegions);
  const router = useRouter();
  // 권한 변수: 역할별 상세 권한
  const canCreatePin = role === 'admin';
  const canEditPin = role === 'admin' || role === 'leader' || role === 'member';
  // 'election' 및 'admin' 역할만 보수 요청 작성 가능. 다른 역할은 읽기만 가능.
  const canOnlyRequestFix = role === 'election' || role === 'admin';
  const canManageUsers = role === 'admin';

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // 전체 마커 및 요약
  const [markers, setMarkers] = useState<mapboxgl.Marker[]>([]);
  const [pinSummaries, setPinSummaries] = useState<PinSummary[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);
  
  // 선택된 핀
  const [selectedPin, setSelectedPin] = useState<{
    id: string;
    title: string;
    status: string;
    lng: number;
    lat: number;
    imagesByStatus: { [status: string]: { url: string; desc: string }[] };
    notes?: string;
    maintenanceRequest?: string;
    region?: string;
    attachLocation?: string;
    attachType?: string;
    address?: string;
    addressNotFound?: boolean;
    dong: string;
  } | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("설치전");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editRegion, setEditRegion] = useState<string>("");
  const [editAttachLocation, setEditAttachLocation] = useState<string>("");
  const [editAttachType, setEditAttachType] = useState<string>("");
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(editMode);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  const [editAddress, setEditAddress] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>('전체');

  // For admin address geocode/resolve
  const [newResolvedAddress, setNewResolvedAddress] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [resolvedResult, setResolvedResult] = useState<{ lat: number, lng: number } | null>(null);

  // If user has exactly one region and is not admin, set regionFilter to that region
  useEffect(() => {
    if (role !== 'admin' && userRegions && userRegions.length === 1) {
      setRegionFilter(userRegions[0]);
    }
  }, [role, userRegions]);

  // 유저 위치 표시용 마커
  const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // 마커 클릭 핸들러
  const handleMarkerClick = async (id: string) => {
    console.log('[MapView] handleMarkerClick:', id);
    // clear highlight from any previously selected marker
    document.querySelectorAll('[data-pin-id]').forEach(el => {
      (el as HTMLElement).style.backgroundColor = '';
    });
    // highlight this marker
    const markerEl = document.querySelector(`[data-pin-id="${id}"]`) as HTMLElement;
    if (markerEl) {
      markerEl.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
    }
    const snap = await getDoc(doc(db, "pins", id));
    const fresh = snap.data()!;
    console.log('[MapView] handleMarkerClick data:', fresh);
    const map = mapRef.current;
    if (!map) return;
    
    map.flyTo({ center: [fresh.lng, fresh.lat], zoom: 15 });

    // 모바일/데스크탑 구분 없이 항상 핀 정보 열기
    setSelectedPin({
      id,
      title: fresh.title || "",
      status: fresh.status || "설치전",
      lng: fresh.lng,
      lat: fresh.lat,
      imagesByStatus: fresh.imagesByStatus || {},
      notes: fresh.notes || "",
      maintenanceRequest: fresh.maintenanceRequest || "",
      region: fresh.region || "",
      attachLocation: fresh.attachLocation || "",
      attachType: fresh.attachType || "",
      address: fresh.address || "",
      addressNotFound: fresh.addressNotFound || false,
      dong: fresh.dong || "",
    });
    // setEditMode(false); // Do not automatically turn OFF edit mode when a pin is clicked
    setEditNotes(fresh.notes || "");
    setEditRegion(fresh.region || "");
    setEditAttachLocation(fresh.attachLocation || "");
    setEditAttachType(fresh.attachType || "");
    setEditAddress(fresh.address || "");
  };
  // 선택된 핀 편집폼 반영
  useEffect(() => {
    if (selectedPin) {
      setEditTitle(selectedPin.title);
      setEditStatus(selectedPin.status);
      setEditNotes(selectedPin.notes || "");
      setEditAddress(selectedPin.address || "");
    }
  }, [selectedPin]);

  // 선택된 핀 Live-Sync
  useEffect(() => {
    if (!selectedPin) return;
    const pinRef = doc(db, "pins", selectedPin.id);
    const unsub = onSnapshot(pinRef, (snap) => {
      const data = snap.data();
      if (!data) return;
      setSelectedPin((prev) =>
        prev
          ? {
              ...prev,
              title: data.title || "",
              status: data.status || "설치전",
              lng: data.lng,
              lat: data.lat,
              imagesByStatus: data.imagesByStatus || {},
              notes: data.notes || "",
              maintenanceRequest: data.maintenanceRequest || "",
              region: data.region || "",
              attachLocation: data.attachLocation || "",
              attachType: data.attachType || "",
              address: data.address || "",
              addressNotFound: data.addressNotFound || false,
              dong: data.dong,
            }
          : null
      );
      setEditTitle(data.title || "");
      setEditStatus(data.status || "설치전");
      setEditNotes(data.notes || "");
      setEditRegion(data.region || "");
      setEditAttachLocation(data.attachLocation || "");
      setEditAttachType(data.attachType || "");
      setEditAddress(data.address || "");
    });
    return () => unsub();
  }, [selectedPin?.id]);

  // 맵 초기화 및 전체 pins 구독
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [128.583, 35.8916],
      zoom: 13,
    });
    mapRef.current = map;
    // Map-based compass control (with custom compass click handler)
    const navControl = new mapboxgl.NavigationControl({ showZoom: false, showCompass: true });
    map.addControl(navControl, 'top-right');

    // Add custom handler: when compass is clicked, move to user location
    map.once('load', () => {
      const compassBtn = document.querySelector('.mapboxgl-ctrl-compass');
      // Scale compass button and inner SVG for consistent sizing/centering
      if (compassBtn instanceof HTMLElement) {
        const inner = compassBtn.querySelector('svg') as SVGElement | null;
        if (inner) {
          inner.style.width = '36px';
          inner.style.height = '36px';
        }
        compassBtn.style.width = '48px';
        compassBtn.style.height = '48px';
        compassBtn.style.display = 'flex';
        compassBtn.style.alignItems = 'center';
        compassBtn.style.justifyContent = 'center';
      }
      compassBtn?.addEventListener('click', () => {
        const marker = userLocationMarkerRef.current;
        if (!marker) return;
        const lngLat = marker.getLngLat();
        map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 15 });
      });
    });
    map.on('style.load', () => {
      const layers = map.getStyle().layers;
      if (!layers) return;
      
      for (const layer of layers) {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          map.setLayoutProperty(layer.id, 'text-field', ['get', 'name_ko']);
        }
      }
    });
    
    
    const pinsQuery = query(
      collection(db, "pins"),
      orderBy("createdAt", "asc")  // 생성일 오름차순
    );
    // tiny offset generator for visual separation of overlapping markers
    const offset = () => (Math.random() - 0.5) * 0.0003; // ~±0.00005
    const unsubscribe = onSnapshot(pinsQuery, (snapshot) => {
      console.log('[MapView] pins onSnapshot, total docs:', snapshot.docs.length);
      console.log('[MapView] pins onSnapshot role/userRegions:', { role, userRegions });
      // Filter docs by region for non-admins
      const docs = snapshot.docs.filter(doc => {
        const r = doc.data().region;
        // Admin: see all regions or filtered one
        if (role === 'admin') {
          return regionFilter === '전체' || r === regionFilter;
        }
        // Multi-region non-admin: '전체' shows only user's regions
        if (userRegions && userRegions.length > 1) {
          return regionFilter === '전체'
            ? userRegions.includes(r)
            : r === regionFilter;
        }
        // Single-region user: always their assigned region
        return r === (userRegions && userRegions[0]);
      });
      console.log('[MapView] filtered docs count:', docs.length);
      const regionOrder = ['북구', '남구', '달성군'];
      const summaries: PinSummary[] = docs.map(doc => {
        const d = doc.data() as any;
        return {
          id: doc.id,
          dong: d.dong || "",
          region: d.region || "",
          status: d.status || "설치전",
          hasMaintenanceRequest: !!d.maintenanceRequest,
          number: d.번호 || 0,
          addressNotFound: d["주소가 존재하지 않음"] === true,
        };
      });
      summaries.sort((a, b) => {
        const rDiff = regionOrder.indexOf(a.region) - regionOrder.indexOf(b.region);
        if (rDiff !== 0) return rDiff;
        return (a.number || 0) - (b.number || 0);
      });
      setPinSummaries(summaries);
      snapshot.docChanges().forEach((change) => {
        const raw = change.doc.data();
        const r = raw.region;
        // Admin: show all or filtered
        if (role === 'admin') {
          if (regionFilter !== '전체' && r !== regionFilter) return;
        }
        // Multi-region non-admin: '전체' shows only user's regions, otherwise filter
        else if (userRegions && userRegions.length > 1) {
          if (regionFilter === '전체') {
            if (!userRegions.includes(r)) return;
          } else {
            if (r !== regionFilter) return;
          }
        }
        // Single-region user: always own region
        else {
          if (r !== (userRegions && userRegions[0])) return;
        }
        // Validate presence and type of lng/lat before using
        if (!raw || typeof raw.lng !== 'number' || typeof raw.lat !== 'number') {
          console.warn('⚠️ Skipping invalid pin data:', raw);
          return; // Skip invalid documents
        }

        const data = raw as MarkerData & { status?: string };
        const pinId = change.doc.id;

        if (change.type === "added") {
          // Apply a small offset for visual separation of overlapping pins
          const newMarker = createMarker(
            map,
            { id: pinId, lng: data.lng + offset(), lat: data.lat + offset(), title: data.title || "" },
            handleMarkerClick,
            statusColorMap[data.status || "설치전"]
          );
          newMarker.getElement().dataset.pinId = pinId;
          if (canEditPin && editMode) {
            newMarker.setDraggable(true);
            newMarker.on('dragend', async () => {
              const { lng, lat } = newMarker.getLngLat();
              await updateDoc(doc(db, "pins", pinId), { lng, lat });
              console.log(`[MapView] Pin ${pinId} moved to`, { lng, lat });
            });
          }
          setMarkers((prev) => [...prev, newMarker]);
        } else if (change.type === "removed") {
          setMarkers((prev) => prev.filter((m) => {
            if (m.getElement().dataset.pinId === pinId) {
              m.remove();
              return false;
            }
            return true;
          }));
        } else if (change.type === "modified") {
          setMarkers((prev) => prev.map((m) => {
            if (m.getElement().dataset.pinId === pinId) {
              m.remove();
              const newMarker = createMarker(
                map,
                { id: pinId, lng: data.lng, lat: data.lat, title: data.title || "" },
                handleMarkerClick,
                statusColorMap[data.status || "설치전"]
              );
              newMarker.getElement().dataset.pinId = pinId;
              if (canEditPin && editMode) {
                newMarker.setDraggable(true);
                newMarker.on('dragend', async () => {
                  const { lng, lat } = newMarker.getLngLat();
                  await updateDoc(doc(db, "pins", pinId), { lng, lat });
                  console.log(`[MapView] Pin ${pinId} moved to`, { lng, lat });
                });
              }
              return newMarker;
            }
            return m;
          }));
        }
      });
    });

    // 지도 클릭 -> 새 핀 생성
    map.on("click", async (e) => {
      console.log('[MapView] map click at:', e.lngLat.toArray());
      if (!canCreatePin || !editModeRef.current) return;
      const pinId = `${Date.now()}`;
      // Apply a small random offset to lng/lat before saving
      const offset = () => (Math.random() - 0.5) * 0.0001; // tiny offset ~ ±0.00005
      const pinData = {
        lng: e.lngLat.lng + offset(),
        lat: e.lngLat.lat + offset(),
        title: "새 핀",
        status: "설치전",
        imagesByStatus: {},
        region: "",
      };
      const newMarker = createMarker(
        map,
        { id: pinId, lng: pinData.lng, lat: pinData.lat, title: pinData.title },
        handleMarkerClick,
        statusColorMap[pinData.status]
      );
      newMarker.getElement().dataset.pinId = pinId;
      setMarkers((prev) => [...prev, newMarker]);
      console.log('[MapView] creating new pin:', pinId, pinData);
      await setDoc(doc(db, "pins", pinId), {
        ...pinData,
        createdAt: serverTimestamp(),
      });
      // Open the info panel for the new pin
      handleMarkerClick(pinId);
    });

    return () => {
      console.log('[MapView] unsubscribing pins and removing map');
      unsubscribe();
      map.remove();
      mapRef.current = null;
      setMarkers([]);
    };
   }, [role, userRegions, regionFilter]);

  // 사진 업로드 & 설명 변경
  const handleUpload = async (status: string, files: FileList | null) => {
    if (!selectedPin || !files) return;
    const pinRef = doc(db, "pins", selectedPin.id);
    for (const file of Array.from(files)) {
      const ref = storageRef(storage, `pins/${selectedPin.id}/${status}/${file.name}-${Date.now()}`);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      await updateDoc(pinRef, {
        [`imagesByStatus.${status}`]: arrayUnion({
          url,
          desc: "",
          uploadedAt: Date.now()
        })
      });
    }
  };
  const handleDescChange = async (status: string, idx: number, desc: string) => {
    if (!selectedPin) return;
    const pinRef = doc(db, "pins", selectedPin.id);
    const arr = selectedPin.imagesByStatus[status] || [];
    const newArr = arr.map((item, i) => (i === idx ? { ...item, desc } : item));
    await updateDoc(pinRef, { imagesByStatus: { ...selectedPin.imagesByStatus, [status]: newArr } });
  };

  // Delete an uploaded image
  const handleDeleteImage = async (status: string, idx: number) => {
    if (!selectedPin) return;
    const pinRef = doc(db, "pins", selectedPin.id);
    const arr = selectedPin.imagesByStatus[status] || [];
    const itemToRemove = arr[idx];
    // Remove the selected image from the array
    await updateDoc(pinRef, {
      [`imagesByStatus.${status}`]: arrayRemove(itemToRemove)
    });
  };

  // Continuous location tracking: watchPosition
   useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const map = mapRef.current;
        if (!map) return;
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLngLat([coords.longitude, coords.latitude]);
        } else {
          const el = document.createElement('div');
          Object.assign(el.style, {
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,122,255,0.3)',
            border: '2px solid rgba(0,122,255,0.6)',
          });
          userLocationMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([coords.longitude, coords.latitude])
            .addTo(map);
        }
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
   }, [role, userRegions, regionFilter]);

  // Toggle dragging on markers when editMode changes, and persist coords on drag end
  useEffect(() => {
    // Make pin summaries accessible for pin name lookup
    const selectedPinSummaries = pinSummaries;
    console.log('[MapView] Toggle drag]', { editMode, canEditPin, selectedPin: selectedPin?.id });
    markers.forEach(marker => {
      const pinId = marker.getElement().dataset.pinId!;
      const isDraggable = canEditPin && editMode;
      marker.setDraggable(isDraggable);

      // Attach drag handlers only once
      if (isDraggable && !(marker as any).__dragHandlerAttached) {
        let originalLngLat = marker.getLngLat();
        marker.on('dragstart', () => {
          originalLngLat = marker.getLngLat();
        });
        marker.on('dragend', async () => {
          const newLngLat = marker.getLngLat();
          // Fallback for originalLngLat if dragstart didn't fire
          const origLngLat = originalLngLat || newLngLat;
          const pinData = selectedPinSummaries.find(p => p.id === pinId);
          const pinName = pinData ? `${pinData.region}-${pinData.dong}` : "이 핀";
          const confirmed = window.confirm(`지금 '${pinName}'의 위치를 바꾸려고 합니다.\n이 위치로 확정할까요?`);
          if (confirmed) {
            console.log(`[MapView] Pin ${pinId} dragend → 저장`, newLngLat);
            await updateDoc(doc(db, "pins", pinId), { lng: newLngLat.lng, lat: newLngLat.lat });
          } else {
            console.log(`[MapView] Pin ${pinId} dragend → 취소됨, 원래 위치로 복원`);
            marker.setLngLat(origLngLat);
            alert(`'${pinName}'의 위치 변경이 취소되었습니다.`);
          }
        });
        (marker as any).__dragHandlerAttached = true;
      }
    });
  }, [editMode, canEditPin, markers, selectedPin, pinSummaries]);

  // Detect mobile for summary click behavior
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    if (typeof window !== 'undefined') {
      checkMobile();
      window.addEventListener('resize', checkMobile);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', checkMobile);
      }
    };
  }, []);

  // Summary click: only flyTo on mobile, full info on desktop
  const handleSummaryRowClick = async (id: string) => {
    // clear highlight from any previously selected marker
    document.querySelectorAll('[data-pin-id]').forEach(el => {
      (el as HTMLElement).style.backgroundColor = '';
    });
    // highlight this marker
    const markerEl = document.querySelector(`[data-pin-id="${id}"]`) as HTMLElement;
    if (markerEl) {
      markerEl.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
    }
    const snap = await getDoc(doc(db, "pins", id));
    const data = snap.data();
    if (!data) return;
    const map = mapRef.current;
    if (!map) return;
    // map.flyTo({ center: [data.lng, data.lat], zoom: 15 });
    if (isMobile) {
      map.flyTo({ center: [data.lng, data.lat], zoom: 15, offset: [+window.innerWidth / 4, 0] });
    } else {
      map.flyTo({ center: [data.lng, data.lat], zoom: 15 });
    }
  };

  return (
    <>
    {/* 화면 오른쪽 아래 고정 로고 (모바일 + 데스크탑 모두) */}
    {/* 현재 로그인 유저 역할 표시 (예시) */}
    <div className="fixed bottom-4 right-4 md:top-4 md:right-16 md:bottom-auto z-50 bg-white rounded px-3 py-2 shadow text-sm flex flex-col space-y-2">
      <div className="flex items-center space-x-2">
        <div className="flex items-center">
          <span className="mr-1">내 역할:</span>
          <span className="font-semibold">
            {`${userRegions && userRegions.length ? userRegions.join(',') + '의 ' : ''}${roleLabelMap[role] ?? "알 수 없음"}`}
          </span>
        </div>
        <button
          className="bg-gray-800 text-white rounded-full p-2 shadow"
          onClick={async () => {
            await signOut(auth);
            router.push('/login');
          }}
          title="로그아웃"
        >
          🔒
        </button>
      </div>
      
      {canEditPin && (
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-gray-700">핀 이동/추가</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={editMode}
              onChange={() => setEditMode(!editMode)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 transition-all duration-300" />
            <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 transform peer-checked:translate-x-full" />
          </label>
        </div>
      )}

      {role === 'admin' && (
        <button
          onClick={() => router.push('/admin')}
          className="bg-purple-600 text-white px-2 py-1 rounded text-xs hover:bg-purple-700"
        >
          관리자 페이지
        </button>
      )}
      {role === 'admin' && (
        <div className="flex flex-col space-y-1">
          <button
            onClick={async () => {
              const confirmed = window.confirm('정말로 전체 사진을 다운로드하시겠습니까?');
              if (!confirmed) return;

              // 폴링 함수 정의
              const pollProgress = () => {
                const interval = setInterval(async () => {
                  try {
                    const res = await fetch('/api/download-progress');
                    const { completed, total } = await res.json();
                    setDownloadProgressText(`${completed} / ${total} 이미지 다운로드 중...`);
                    if (completed >= total && total > 0) {
                      clearInterval(interval);
                      setDownloadProgressText('');
                    }
                  } catch (err) {
                    // 무시
                  }
                }, 1000);
              };

              setIsDownloading(true); // 로딩 상태 on
              setDownloadProgressText('0 / 0 이미지 다운로드 중...');
              pollProgress();

              try {
                const res = await fetch('/api/download-all-images');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'all_photos.zip';
                a.click();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                alert('다운로드에 실패했습니다. 다시 시도해주세요.');
              } finally {
                setIsDownloading(false); // 로딩 상태 off
              }
            }}
            disabled={isDownloading}
            className={`px-2 py-1 rounded text-xs text-white ${isDownloading ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {isDownloading ? '다운로드 중...' : '전체 사진 다운로드'}
          </button>
          <div className="text-xs text-gray-600">{downloadProgressText}</div>
        </div>
      )}

      {(role === 'admin' || role === 'election') && (
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => handleDownloadPinsExcel(role, userRegions, regionFilter )}
            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
          >
            핀 목록 다운로드
          </button>
          <button
            onClick={() => router.push(`/print?region=${regionFilter}`)}
            className="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700"
          >
            계획서 프린트(chrome)
          </button>
          <button
            onClick={() => router.push(`/print-alt?region=${regionFilter}`)}
            className="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700"
          >
            보고서 프린트(chrome)
          </button>
        </div>
      )}
    </div>
    <div className="fixed bottom-4 left-4 z-50">
      <img src="/logo-transparent.png" alt="HD Office Logo" className="h-10" />
    </div>

      {/* 요약 테이블: 화면 왼쪽 상단, 모바일에서는 토글 가능 */}
      {/* 토글 버튼 (모바일) */}
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <button
          className="bg-gray-800 text-white px-2 py-1 rounded"
          onClick={() => setIsSummaryOpen(!isSummaryOpen)}
        >
          {isSummaryOpen ? '▲ 현황표' : '▼ 현황표'}
        </button>
      </div>
      {/* 요약 테이블 */}
      <div className={isSummaryOpen ?
        'block fixed top-12 left-4 bg-white p-2 shadow rounded z-50 md:block max-h-[80vh] overflow-y-auto'
        :
        'hidden fixed top-12 left-4 bg-white p-2 shadow rounded z-50 md:block max-h-[80vh] overflow-y-auto'
      }>
        {/* 부착 현황표 제목 및 필터 표시 */}
        <div className="font-semibold text-lg mb-2">
          부착 현황표
          <span className="text-sm font-normal ml-2">
            ({regionFilter})
          </span>
        </div>
        {/* 테이블 */}
        <table className="table-auto text-sm">
          <thead>
            <tr>
              <th className="px-2">이름</th>
              <th className="px-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {pinSummaries.map((p, i) => (
              <tr
                key={p.id}
                className={`${summaryColorMap[p.status] ?? ''} ${p.addressNotFound ? 'bg-red-300 text-black font-semibold' : ''} cursor-pointer hover:bg-gray-100`}
                onClick={() => {
                  if (isMobile) {
                    handleSummaryRowClick(p.id);
                  } else {
                    handleMarkerClick(p.id);
                  }
                }}
              >
                <td className="px-2 max-w-[20ch] truncate">
                  {p.hasMaintenanceRequest && <span className="mr-1">🛠️</span>}
                  {`${p.region}-${p.dong}`}
                </td>
                <td className="px-2">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 맵 영역 */}
      <div ref={mapContainerRef} style={{ width: "100vw", height: "100vh" }} />

      {/* 관리자 지역 필터 버튼 (맵 위) */}
{(role === 'admin' || (userRegions && userRegions.length >= 1)) && (
  <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex space-x-2">
    {(
      role === 'admin'
        ? ['전체','북구','남구','달성군']
        : (userRegions.length > 1 ? ['전체', ...userRegions] : userRegions)
    ).map(region => (
      <button
        key={region}
        onClick={() => setRegionFilter(region)}
        className={`px-2 py-1 text-xs rounded ${
          regionFilter === region
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
        }`}
      >
        {region}
      </button>
    ))}
  </div>
)}

        {/* 사이드 패널: 선택된 핀 상세 */}
{selectedPin && (
  <div className="fixed top-0 right-0 w-fit max-w-[300px] h-full bg-white border-l p-4 overflow-y-auto overflow-x-hidden z-50">
    {/* 닫기 버튼 */}
    <button
      className="absolute top-4 right-4 text-gray-600 hover:text-gray-900 text-2xl"
      onClick={() => setSelectedPin(null)}
    >
      ×
    </button>

    <div className="flex items-center mb-4 space-x-2">
  <h2 className="text-xl font-semibold">핀 정보</h2>
  <button
    onClick={async () => {
      if (!selectedPin) return;
      try {
        const kakaoMapLink = await getKakaoMapLink(selectedPin.lat, selectedPin.lng, selectedPin.title);
        const a = document.createElement('a');
        a.href = kakaoMapLink;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      } catch (error) {
        console.error("카카오맵 링크 생성 오류:", error);
      }
    }}
    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-1 px-3 rounded text-sm"
  >
    카카오맵으로 열기
  </button>
</div>

    {canEditPin ? (
      <>
        {/* --- 편집 모드 --- */}
        {/* 이름: region-dong 조합으로 표시 */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">이름</label>
          <div className="w-full border p-1 rounded bg-gray-100">
            {selectedPin.region}-{selectedPin.dong}
          </div>
        </div>
        {/* 주소 수정 필드 */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">주소</label>
          {(role === 'admin' || role === 'leader') ? (
            <input
              className="w-full border p-1 rounded"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              onBlur={async (e) => {
                if (selectedPin) {
                  const newAddr = e.target.value;
                  if (newAddr !== selectedPin.address) {
                    await updateDoc(doc(db, "pins", selectedPin.id), { address: newAddr });
                  }
                }
              }}
            />
          ) : (
            <div className="w-full border p-1 rounded bg-gray-100">{selectedPin.address}</div>
          )}
          {selectedPin?.addressNotFound && (
            <div className="text-red-500 mt-1">(주소가 존재하지 않음)</div>
          )}
        </div>
        <div className="mb-4">
          <label className="block font-semibold mb-1">세부위치</label>
          {(role === 'admin' || role === 'leader') ? (
            <input
              className="w-full border p-1 rounded"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={async (e) => {
                if (selectedPin && e.target.value !== selectedPin.title) {
                  await updateDoc(doc(db, "pins", selectedPin.id), { title: e.target.value });
                }
              }}
            />
          ) : (
            <div className="w-full border p-1 rounded bg-gray-100">{selectedPin.title}</div>
          )}
        </div>
        
        {/* 첩부 장소 (체크박스 형태로 다중 선택) */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">첩부장소유형</label>
          {role === 'admin' ? (
            <div className="space-y-1">
              {["펜스", "담장", "벽면", "기타"].map((loc) => (
                <label key={loc} className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editAttachLocation.includes(loc)}
                    onChange={async (e) => {
                      const isChecked = e.target.checked;
                      const newAttachLocations = isChecked
                        ? [...editAttachLocation.split(','), loc].filter(Boolean)
                        : editAttachLocation.split(',').filter((item) => item !== loc);
                      setEditAttachLocation(newAttachLocations.join(','));
                      if (selectedPin) {
                        await updateDoc(doc(db, "pins", selectedPin.id), { attachLocation: newAttachLocations.join(',') });
                      }
                    }}
                  />
                  <span>{loc}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="w-full border p-1 rounded bg-gray-100">
              {selectedPin?.attachLocation || <span className="italic text-gray-400">미정</span>}
            </div>
          )}
        </div>

        {/* 첩부 형태 (체크박스 형태로 다중 선택) */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">첩부방법</label>
          {role === 'admin' ? (
            <div className="space-y-1">
              {["테이프", "로프"].map((type) => (
                <label key={type} className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editAttachType.includes(type)}
                    onChange={async (e) => {
                      const isChecked = e.target.checked;
                      const newAttachTypes = isChecked
                        ? [...editAttachType.split(','), type].filter(Boolean)
                        : editAttachType.split(',').filter((item) => item !== type);
                      setEditAttachType(newAttachTypes.join(','));
                      if (selectedPin) {
                        await updateDoc(doc(db, "pins", selectedPin.id), { attachType: newAttachTypes.join(',') });
                      }
                    }}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="w-full border p-1 rounded bg-gray-100">
              {selectedPin?.attachType || <span className="italic text-gray-400">미정</span>}
            </div>
          )}
        </div>
        
        {/* 참고사항 필드 */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">참고사항</label>
          <textarea
            className="w-full border p-1 rounded text-red-500"
            value={editNotes}
            rows={2}
            placeholder="참고사항 입력"
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={async (e) => {
              if (!selectedPin) return;
              const newNotes = e.target.value;
              if ((selectedPin.notes || "") !== newNotes) {
                await updateDoc(doc(db, "pins", selectedPin.id), { notes: newNotes });
              }
            }}
          />
        </div>
        {/*보수 요청 사항 필드 */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">보수 요청</label>
          {canOnlyRequestFix ? (
            <textarea
              className="w-full border p-1 rounded text-blue-500"
              defaultValue={selectedPin?.maintenanceRequest || ""}
              rows={2}
              placeholder="보수가 필요한 내용을 입력하세요"
              onBlur={async (e) => {
                const newRequest = e.target.value;
                if (!selectedPin) return;
                if ((selectedPin.maintenanceRequest || "") !== newRequest) {
                  await updateDoc(doc(db, "pins", selectedPin.id), { maintenanceRequest: newRequest });
                  console.log(`🛠️ [보수요청 저장] 핀 ID: ${selectedPin.id}, 작성자: ${user?.email || "알 수 없음"}, 내용: ${newRequest}`);
                }
              }}
            />
          ) : (
            <div className={selectedPin?.maintenanceRequest ? "text-blue-500 whitespace-pre-line" : "text-gray-400 italic min-h-[1.5rem]"}>
              {selectedPin?.maintenanceRequest || "보수 요청 없음"}
            </div>
          )}
        </div>
        {/* 상태 수정 - moved below maintenance request */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">상태</label>
          <select
            className="w-full border p-1 rounded"
            value={editStatus}
            onChange={async (e) => {
              const newStatus = e.target.value;
              setEditStatus(newStatus);
              await updateDoc(doc(db, "pins", selectedPin.id), { status: newStatus });
            }}
          >
            {statusList.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* 사진 & 설명 업로드 슬롯 */}
        {statusList.filter((st) => st !== '철거필요' && st !== '실사완료').map((st) => (
          <div key={st} className="mb-6">
            <h3 className="font-semibold mb-2">{photoLabelMap[st] || st}</h3>
            <div className="mb-2 space-y-2">
              {(selectedPin.imagesByStatus[st] || []).map((item, idx) => (
                <div key={idx} className="mb-4">
                  <img
                    src={item.url}
                    className="w-full h-48 object-cover rounded mb-2"
                  />
                  <textarea
                    className="w-full border p-1 rounded"
                    defaultValue={item.desc}
                    onBlur={async (e) => {
                      const newDesc = e.target.value;
                      if (newDesc !== item.desc) {
                        await handleDescChange(st, idx, newDesc);
                      }
                    }}
                    rows={2}
                  />
                  <button
                    onClick={async () => {
                      if (window.confirm('사진을 삭제하시겠습니까?')) {
                        await handleDeleteImage(st, idx);
                      }
                    }}
                    className="mt-1 text-red-500 text-xs"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleUpload(st, e.target.files)}
              className="block"
            />
            <hr className="mt-4" />
          </div>
        ))}

        {/* 삭제 버튼 */}
        {role === 'admin' && (
          <button
            className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            onClick={async () => {
              if (!selectedPin) return;
              await deleteDoc(doc(db, "pins", selectedPin.id));
              setSelectedPin(null);
            }}
          >
            삭제
          </button>
        )}
      </>
    ) : (
      <>
        {/* --- 조회 전용 모드 --- */}
        <p className="mb-3"><strong>이름:</strong> {selectedPin.region}-{selectedPin.dong}</p>
        <div className="mb-3">
          <strong>주소:</strong> {selectedPin.address}
        </div>
        <div className="mb-4">
          <label className="block font-semibold mb-1">주소</label>
          <div className="w-full border p-1 rounded bg-gray-100">{selectedPin.address}</div>
          {selectedPin.addressNotFound && (
            <div className="text-red-500 mt-1">(주소가 존재하지 않음)</div>
          )}
        </div>
        <div className="mb-4">
          <label className="block font-semibold mb-1">세부위치</label>
          <div className="w-full border p-1 rounded bg-gray-100">{selectedPin.title}</div>
        </div>
        {/* 첩부 장소 (조회 전용) */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">첩부장소유형</label>
          <div className="w-full border p-1 rounded bg-gray-100">
            {selectedPin?.attachLocation || <span className="italic text-gray-400">미정</span>}
          </div>
        </div>
        {/* 첩부 형태 (조회 전용) */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">첩부방법</label>
          <div className="w-full border p-1 rounded bg-gray-100">
            {selectedPin?.attachType || <span className="italic text-gray-400">미정</span>}
          </div>
        </div>
        
        {/* 참고사항 필드 (조회 전용) */}
        <div className="mb-4">
          <span className="block font-semibold mb-1">참고사항</span>
          <div className="text-red-500 whitespace-pre-line min-h-[1.5rem]">
            {selectedPin.notes ? selectedPin.notes : <span className="italic text-gray-400">없음</span>}
          </div>
        </div>

        {/* 보수 요청 영역: 선관위(election), 관리자만 작성 가능, 다른 역할은 조회만 가능 */}
        {canOnlyRequestFix && (
          <div className="mb-4">
            <label className="block font-semibold mb-1">보수 요청</label>
            <textarea
              className="w-full border p-1 rounded text-blue-500"
              defaultValue={selectedPin?.maintenanceRequest || ""}
              rows={2}
              placeholder="보수가 필요한 내용을 입력하세요"
              onBlur={async (e) => {
                const newRequest = e.target.value;
                if (!selectedPin) return;
                if ((selectedPin.maintenanceRequest || "") !== newRequest) {
                  await updateDoc(doc(db, "pins", selectedPin.id), { maintenanceRequest: newRequest });
                  // election 역할이 보수 요청 저장 시, 핀 ID + 이메일 + 내용 로그 출력
                  console.log(`🛠️ [보수요청 저장] 핀 ID: ${selectedPin.id}, 작성자: ${user?.email ?? "알 수 없음"}, 내용: ${newRequest}`);
                }
              }}
            />
          </div>
        )}
        {/* 보수 요청 영역: 선관위가 아니면, 항상 표시(있으면 파랑, 없으면 회색 이탤릭) */}
        {!canOnlyRequestFix && (
          <div className="mb-4">
            <span className="block font-semibold mb-1">보수 요청</span>
            <div
              className={
                selectedPin.maintenanceRequest
                  ? "text-blue-500 whitespace-pre-line"
                  : "text-gray-400 italic min-h-[1.5rem]"
              }
            >
              {selectedPin.maintenanceRequest || "보수 요청 없음"}
            </div>
          </div>
        )}
        {/* 상태 표시 - moved below maintenance request */}
        <div className="mb-4">
          <span className="block font-semibold mb-1">상태:</span>
          <div>{selectedPin.status}</div>
        </div>

        {/* 사진 & 설명 보기 전용 */}
        {statusList.filter((st) => st !== '철거필요' && st !== '실사완료').map((st) => (
          <div key={st} className="mb-6">
            <h3 className="font-semibold mb-1">{photoLabelMap[st] || st}</h3>
            {(selectedPin.imagesByStatus[st] || []).length === 0 ? (
              <p className="text-sm italic text-gray-400 mb-2">업로드된 사진이 없습니다</p>
            ) : (
              selectedPin.imagesByStatus[st].map((item, idx) => (
                <div key={idx} className="mb-4">
                  <img
                    src={item.url}
                    className="w-full h-48 object-cover rounded mb-1"
                    alt={`${st} 이미지 ${idx + 1}`}
                  />
                  <p className="text-sm">{item.desc || <span className="italic text-gray-400">설명 없음</span>}</p>
                </div>
              ))
            )}
          </div>
        ))}
      </>
    )}
  </div>
)}
    </>
  );
};

export default MapView;
