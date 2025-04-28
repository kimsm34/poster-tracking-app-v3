//c pages/print.tsx
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useRouter } from 'next/router';

interface Pin {
  id: string;
  dong: string;
  title: string;
  address: string;
  region: string;
  attachLocation: string;
  attachType: string;
  size: string;
  notes?: string;
  imagesByStatus: { [status: string]: { url: string; desc: string }[] };
  number: number;
}

const PrintPage: React.FC = () => {
  const [pins, setPins] = React.useState<Pin[]>([]);
  const { role, region: userRegions } = useAuth();
  const router = useRouter();

  const RetryableImageWrapper: React.FC<{ img: { url: string; desc: string; uploadedAt?: number }, idx: number }> = ({ img, idx }) => {
    const version = img.uploadedAt || Date.now();
    const [src, setSrc] = useState(`/api/image-proxy?url=${encodeURIComponent(img.url)}&v=${version}`);
    const [triedOnce, setTriedOnce] = useState(false);

    return (
      <div
        key={idx}
        className="print-img-wrap"
        style={{
          flex: '0 0 auto',
          width: 'calc(50% - 4px)',
          height: '180px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <Image
          src={src}
          alt="설치사진"
          width={363}
          height={180}
          quality={1}
          unoptimized
          style={{ objectFit: 'contain', width: '180px', height: '100%' }}
          onError={() => {
            if (!triedOnce) {
              const retryUrl = src.includes('?')
                ? `${src}&retry=${Date.now()}`
                : `${src}?retry=${Date.now()}`;
              setSrc(retryUrl);
              setTriedOnce(true);
            }
          }}
        />
        <div className="print-img-desc" style={{ flex: 1, fontSize: '12px', lineHeight: '1.4' }}>{img.desc}</div>
      </div>
    );
  };

  useEffect(() => {
    (async () => {
      const q = query(collection(db, 'pins'), orderBy('createdAt'));
      const snap = await getDocs(q);
      const all = snap.docs
        .map(d => {
          const data = d.data() as any;
          console.log('🔥 raw pin data:', data);

          return {
            id: d.id,
            number: data.number ?? data.번호 ?? 0,
            dong: data.dong || '',
            title: data.title || '',
            address: data.address || '',
            region: data.region || '',
            attachLocation: data.attachLocation || '',
            attachType: data.attachType || '',
            size: data.size || '',
            notes: data.notes || '',
            imagesByStatus: data.imagesByStatus || {},
          };
        })
        .filter((p: any) => {
          const queryRegion = router.query.region;
          if (role === 'admin') {
            if (typeof queryRegion === 'string') {
              if (queryRegion === '전체') return true;
              return p.region === queryRegion;
            }
            return true;
          } else {
            if (typeof queryRegion === 'string') {
              if (queryRegion === '전체') return userRegions.includes(p.region);
              return p.region === queryRegion;
            }
            return userRegions.includes(p.region);
          }
        });
      // Sort pins by regionOrder, then by number
      const regionOrder = ['북구', '남구', '달성군'];
      all.sort((a, b) => {
        const ra = regionOrder.indexOf(a.region);
        const rb = regionOrder.indexOf(b.region);
        if (ra !== rb) return ra - rb;
        return (a.number || 0) - (b.number || 0);
      });
      setPins(all);
      // 페이지 로드되면  바로 인쇄 대화상자 띄우기
      //setTimeout(() => window.print(), 300);
    })();
  }, [role, userRegions]);

  return (
    <>
      <style jsx global>{`
@media print {
  .no-print {
    display: none !important;
  }
  .print-table thead {
    display: table-header-group !important;
  }
  .print-table tbody {
    display: table-row-group !important;
  }
  /* Prevent splitting inside rows or cells */
  .print-table tbody tr,
  .print-table tbody td,
  .print-table tbody th {
    page-break-inside: avoid !important;
    -webkit-page-break-inside: avoid !important;
    break-inside: avoid !important;
    -webkit-column-break-inside: avoid !important;
  }
  /* Force a page break after every 4 body rows */
  .print-table tbody tr:nth-child(4n) {
    page-break-after: always !important;
    break-after: page !important;
    -webkit-break-after: page !important;
  }
  .print-table thead tr {
    background-color: #f0f0f0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
.print-table th {
  background-color: #f0f0f0;
}
.print-table thead tr {
  background-color: #f0f0f0;
}
      `}</style>
      <div className="no-print" style={{ marginBottom: '16px' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          메인페이지로 돌아가기
        </button>
      </div>
      <div className="print-container" style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '1200px', width: '100%' }}>
      <table className="print-table" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '30px' }}>연번</th>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '60px' }}>동별연변</th>
            <th style={{ border: '1px solid black', padding: '4px', width: '120px' }}>첨부예정장소명</th>
            <th colSpan={3} style={{ border: '1px solid black', padding: '4px' }}>첩부장소 실시내역</th>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '330px' }}>사진자료</th>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px' }}>비고</th>
          </tr>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ border: '1px solid black', padding: '4px' }}>주소</th>
            <th style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>장소유형</th>
            <th style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>첩부방법</th>
            <th style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>면적(cm)</th>
          </tr>
        </thead>
        <tbody>
          {pins.map((p, i) => (
            <tr
              key={p.id}
              style={{
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <td style={{ border: '1px solid black', padding: '4px', width: '30px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{i + 1}</td>
              <td style={{ border: '1px solid black', padding: '4px', width: '60px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.dong}</td>
              <td style={{ border: '1px solid black', padding: '4px', width: '120px' }}>
                {p.title}<br/>{p.address}
              </td>
              <td style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.attachLocation}</td>
              <td style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.attachType}</td>
              <td style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.size}</td>
              <td style={{ border: '1px solid black', padding: '4px', wordBreak: 'break-word', overflowWrap: 'break-word', width: '330px' }}>
                <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                  {[...(p.imagesByStatus['설치전'] || []), ...(p.imagesByStatus['설치완료'] || [])].map((img, idx) => (
                    <RetryableImageWrapper key={`${p.id}-${idx}`} img={img} idx={idx} />
                  ))}
                </div>
              </td>
              <td
                style={{
                  border: '1px solid black',
                  padding: '4px',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  fontSize: '11px',
                  lineHeight: '1.3',
                }}
              >
                {p.notes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
        </div>
      </div>
    </>
  );
};

export default PrintPage;