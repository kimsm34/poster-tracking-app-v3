// components/ExcelUploadFrontend.tsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useDropzone } from 'react-dropzone';

// 주소 매칭에 실패하면 점진적으로 주소를 줄여서 재시도하는 헬퍼
async function geocodeWithFallback(address: string, apiKey: string) {
  const parts = address.split(/\s+/);
  for (let len = parts.length; len > 0; len--) {
    const query = parts.slice(0, len).join(' ');
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `KakaoAK ${apiKey}` } }
    );
    const json = await res.json();
    if (json.documents && json.documents.length > 0) {
      return { loc: json.documents[0], usedFallback: query !== address };
    }
  }
  return { loc: null, usedFallback: false };
}

type PinRow = {
  번호: number;
  동별연변: string;
  이름: string;
  주소: string;
  구: string;
  첩부장소: string;
  첩부형태: string;
  면적: string;
  참고사항?: string;
};

export default function ExcelUploadFrontend() {
  useEffect(() => {
    console.log('[ExcelUploadFrontend] Component mounted');
  }, []);

  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [failures, setFailures] = useState<{ row: PinRow; error: any }[]>([]);
  const [fallbacks, setFallbacks] = useState<{ original: string; usedQuery: string }[]>([]);

  const onDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setStatus('파일 읽는 중…');
    setFallbacks([]);

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: PinRow[] = XLSX.utils.sheet_to_json(sheet);

    setStatus(`총 ${rows.length}개 행 파싱 완료. 핀 등록 시작…`);

    const failureList: { row: PinRow; error: any }[] = [];
    const fallbackList: { original: string; usedQuery: string }[] = [];
    let success = 0, fail = 0;

    const chunkSize = 100;
    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize);
      await Promise.all(chunk.map(async (row, idx) => {
        const i = start + idx;
        try {
          if (row.번호 == null || !row.동별연변 || !row.이름 || !row.주소 || !row.구 || !row.면적) {
            throw new Error('필수값 누락');
          }

          const { loc, usedFallback } = await geocodeWithFallback(row.주소, process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY!);
          if (!loc) throw new Error(`주소 변환 실패: ${row.주소}`);
          const lat = parseFloat(loc.y), lng = parseFloat(loc.x);

          await addDoc(collection(db, 'pins'), {
            번호: row.번호,
            title: row.이름,
            region: row.구,
            address: row.주소,
            lat,
            lng,
            attachLocation: row.첩부장소,
            attachType: row.첩부형태,
            dong: row.동별연변,
            size: row.면적,
            notes: row.참고사항 || '',
            status: '설치전',
            imagesByStatus: {},
            createdAt: serverTimestamp(),
            ...(usedFallback && { '주소가 존재하지 않음': true }),
          });
          success++;
        } catch (e: any) {
          fail++;
          failureList.push({ row, error: e });
          await addDoc(collection(db, 'pins'), {
            번호: row.번호,
            title: row.이름,
            region: row.구,
            address: '주소 오류',
            lat: null,
            lng: null,
            attachLocation: row.첩부장소,
            attachType: row.첩부형태,
            dong: row.동별연변,
            size: row.면적,
            notes: row.참고사항 || '',
            status: '설치전',
            imagesByStatus: {},
            createdAt: serverTimestamp(),
            주소오류: true,
          });
        }
        setProgress(prev => prev + 1);
      }));
    }

    setFallbacks(fallbackList);
    setStatus(`완료: 성공 ${success}건, 실패 ${fail}건`);
    setFailures(failureList);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
  });

  return (
    <div {...getRootProps()} className="p-6 border-2 border-dashed rounded text-center cursor-pointer">
      <input {...getInputProps()} />
      {isDragActive
        ? <p>여기에 파일을 놓으세요…</p>
        : <p>엑셀 파일을 드래그하거나 클릭하여 선택하세요<br/>(.xlsx, .xls)</p>
      }
      <p className="mt-2">진행: {progress}</p>
      {status && <p className="mt-1 text-sm">{status}</p>}
      {failures.length > 0 && (
        <div className="mt-4 text-left text-sm text-red-600">
          <p className="font-semibold">실패한 항목:</p>
          <ul className="list-disc ml-4">
            {failures.map((f, i) => (
              <li key={i}>
                [동: {f.row.구} / 연번: {f.row.동별연변}] {f.row.이름} - 주소: {f.row.주소}
                <br />오류: {f.error.message || String(f.error)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}