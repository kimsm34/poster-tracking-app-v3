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

interface RetryableImageWrapperProps {
  img: { url: string; desc: string; uploadedAt?: number };
  idx: number;
  style?: React.CSSProperties;
}

const RetryableImageWrapper: React.FC<RetryableImageWrapperProps> = ({ img, idx, style }) => {
  const version = img.uploadedAt || Date.now();
  const [src, setSrc] = useState(`/api/image-proxy?url=${encodeURIComponent(img.url)}&v=${version}`);
  const [triedOnce, setTriedOnce] = useState(false);

  const defaultStyle: React.CSSProperties = {
    flex: '0 0 auto',
    width: 'calc(50% - 4px)',
    height: '180px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px'
  };

  return (
    <div
      key={idx}
      className="print-img-wrap"
      style={{ ...defaultStyle, ...style }}
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

const PrintPage: React.FC = () => {
  const [pins, setPins] = React.useState<Pin[]>([]);
  const { role, region: userRegions } = useAuth();
  const router = useRouter();

  const [regionFilter, setRegionFilter] = useState<string>(
    typeof router.query.region === 'string' ? router.query.region : '전체'
  );
  const [showRemoval, setShowRemoval] = useState<boolean>(true);

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
          const queryRegion = regionFilter;
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
  }, [role, userRegions, regionFilter]);

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
  /* Force a page break after every 4 body rows, except for the last group */
  .print-table tbody tr:nth-child(4n):not(:last-child) {
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
      {role === 'admin' && (
        <div className="no-print" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {['전체','북구','남구','달성군'].map(r => (
            <button
              key={r}
              onClick={() => setRegionFilter(r)}
              style={{
                backgroundColor: regionFilter === r ? '#2563eb' : '#e5e7eb',
                color: regionFilter === r ? '#fff' : '#000',
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {r}
            </button>
          ))}
          <label style={{ marginLeft: '24px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={showRemoval}
              onChange={() => setShowRemoval(!showRemoval)}
              style={{ marginRight: '4px' }}
            />
            철거완료 사진 표시
          </label>
        </div>
      )}
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
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '15px' }}>연번</th>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '30px' }}>동별연변</th>
            <th style={{ border: '1px solid black', padding: '4px', width: '96px' }}>첨부예정장소명</th>
            <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '165px' }}>설치완료 사진</th>
            {showRemoval && (
              <th rowSpan={2} style={{ border: '1px solid black', padding: '4px', width: '82px' }}>철거완료 사진</th>
            )}
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
              <td style={{ border: '1px solid black', padding: '4px', width: '15px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{i + 1}</td>
              <td style={{ border: '1px solid black', padding: '4px', width: '30px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.dong}</td>
              <td style={{ border: '1px solid black', padding: '4px', width: '96px' }}>
                {p.title}<br/>{p.address}
              </td>
              <td style={{ border: '1px solid black', padding: '4px', width: '165px' }}>
                {(() => {
                  const completed = p.imagesByStatus['설치완료'] || [];
                  const pre = p.imagesByStatus['설치전'] || [];
                  const instImgs = [];

                  // 1) 설치완료 2번째, 3번째 우선
                  if (completed[1]) instImgs.push(completed[1]);
                  if (completed[2]) instImgs.push(completed[2]);

                  // 2) 부족 시 설치전 4번째, 5번째
                  [3, 4].forEach(i => {
                    if (instImgs.length < 2 && pre[i]) {
                      instImgs.push(pre[i]);
                    }
                  });

                  // 3) 계속 부족 시 설치완료 1번째, 설치전 3번째
                  if (instImgs.length < 2 && completed[0]) {
                    instImgs.push(completed[0]);
                  }
                  if (instImgs.length < 2 && pre[2]) {
                    instImgs.push(pre[2]);
                  }

                  // 4) 보수완료 사진에서 추가
                  const fixCompleted = p.imagesByStatus['보수완료'] || [];
                  fixCompleted.forEach(img => {
                    if (instImgs.length < 2) {
                      instImgs.push(img);
                    }
                  });

                  // 5) 여전히 부족 시 첫 이미지 복제
                  while (instImgs.length < 2 && instImgs.length > 0) {
                    instImgs.push(instImgs[0]);
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                      {instImgs.map((img, idx) => (
                        <RetryableImageWrapper key={`${p.id}-inst-${idx}`} img={img} idx={idx} />
                      ))}
                    </div>
                  );
                })()}
              </td>
              {showRemoval && (
                <td style={{ border: '1px solid black', padding: '4px', width: '82px' }}>
                  {(() => {
                    const removal = p.imagesByStatus['철거완료'] || [];
                    const last = removal[removal.length - 1];
                    return last ? (
                      <RetryableImageWrapper
                        key={`${p.id}-rem`}
                        img={last}
                        idx={removal.length - 1}
                        style={{ width: '100%' }}
                      />
                    ) : null;
                  })()}
                </td>
              )}
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