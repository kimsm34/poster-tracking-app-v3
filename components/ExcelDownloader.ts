import { collection, getDocs } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";

export async function generatePinsExcel(role: string, userRegions: string[], regionFilter: string) {
  // Fetch all pins
  const snapshot = await getDocs(collection(db, "pins"));
  const allPins = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  // Updated filtering logic
  const targetRegions =
    role === 'admin'
      ? (regionFilter === '전체' ? ['북구', '남구', '달성군'] : [regionFilter])
      : (regionFilter === '전체' ? userRegions : [regionFilter]);

  const filteredPins = allPins.filter(pin => targetRegions.includes(pin.region));

  // Sort pins by region order and then by '번호' field
  const regionOrder = ['북구','남구','달성군'];
  filteredPins.sort((a, b) => {
    const ra = regionOrder.indexOf(a.region);
    const rb = regionOrder.indexOf(b.region);
    if (ra !== rb) return ra - rb;
    return (a.번호 || 0) - (b.번호 || 0);
  });

  const statusList = ["설치전", "설치완료", "보수완료", "철거필요", "철거완료"];

  // Determine max image counts per status
  const maxImagesByStatus: Record<string, number> = {};
  statusList.forEach(status => (maxImagesByStatus[status] = 0));
  filteredPins.forEach(pin => {
    statusList.forEach(status => {
      const imgs = pin.imagesByStatus?.[status] || [];
      if (imgs.length > maxImagesByStatus[status]) {
        maxImagesByStatus[status] = imgs.length;
      }
    });
  });

  // Prepare headers
  const baseHeaders = ['핀 ID', '주소', '세부위치', '참고사항', '보수요청사항'];
  const dynamicHeaders: string[] = [];
  statusList.forEach(status => {
    const count = maxImagesByStatus[status] || 1;
    for (let i = 0; i < count; i++) {
      dynamicHeaders.push(`${status} 사진${i + 1}`);
    }
  });
  const allHeaders = [...baseHeaders, ...dynamicHeaders];

  // Create worksheet and write headers
  const worksheet: XLSX.WorkSheet = {};
  allHeaders.forEach((header, idx) => {
    const cell = XLSX.utils.encode_cell({ c: idx, r: 0 });
    worksheet[cell] = {
      v: header,
      t: "s",
      s: {
        font: { bold: true },
        fill: {
          patternType: "solid",
          fgColor: { rgb: "D9D9D9" }
        }
      }
    };
  });

  // Write data rows
  filteredPins.forEach((pin, i) => {
    const r = i + 1;
    // Basic info
    [
      `${pin.region}-${pin.dong}`,
      pin.address || '',
      pin.title || '',
      pin.notes || '',
      pin.maintenanceRequest || ''
    ].forEach((val, c) => {
      const cell = XLSX.utils.encode_cell({ c, r });
      worksheet[cell] = { v: val, t: "s" };
    });
    // Images
    let col = baseHeaders.length;
    statusList.forEach(status => {
      const imgs = pin.imagesByStatus?.[status] || [];
      const maxCount = maxImagesByStatus[status] || 1;
      for (let j = 0; j < maxCount; j++) {
        const cell = XLSX.utils.encode_cell({ c: col, r });
        if (imgs[j]?.url) {
          worksheet[cell] = {
            v: "사진 보기",
            t: "s",
            l: { Target: imgs[j].url, Tooltip: "사진 보기" }
          };
        } else {
          worksheet[cell] = { v: "", t: "s" };
        }
        col++;
      }
    });
  });

  // Set column widths
  worksheet["!cols"] = allHeaders.map(() => ({ wch: 20 }));

  // Build workbook
  const workbook = XLSX.utils.book_new();
  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: allHeaders.length - 1, r: filteredPins.length }
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, "핀 목록");

  // Save file
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  XLSX.writeFile(workbook, `핀목록_${dateStr}.xlsx`);
}

export async function handleDownloadPinsExcel(role: string, userRegions: string[], regionFilter: string) {
  await generatePinsExcel(role, userRegions, regionFilter);
}