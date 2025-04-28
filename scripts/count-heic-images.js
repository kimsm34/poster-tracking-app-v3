

/**
 * HEIC 이미지 지역별 개수 세기 스크립트
 * 사용법:
 *   터미널에서 다음 명령어 실행:
 *     node scripts/count-heic-images.js
 *
 * 이 스크립트는 Firebase Firestore의 'pins' 컬렉션을 읽고,
 * 각 지역별로 HEIC 확장자를 가진 이미지 개수를 세어 출력합니다.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function countHeicImagesByRegion() {
  const snapshot = await db.collection('pins').get();
  const regionCounts = {
    북구: 0,
    남구: 0,
    달성군: 0,
    기타: 0,
  };

  snapshot.forEach((doc) => {
    const data = doc.data();
    const region = data.region || '기타';
    const imagesByStatus = data.imagesByStatus || {};
    
    for (const status of Object.keys(imagesByStatus)) {
      const images = imagesByStatus[status] || [];
      for (const img of images) {
        if (img.url && img.url.toLowerCase().includes('.heic')) {
          if (regionCounts[region] !== undefined) {
            regionCounts[region]++;
          } else {
            regionCounts['기타']++;
          }
        }
      }
    }
  });

  console.log('📊 HEIC 이미지 지역별 개수');
  for (const [region, count] of Object.entries(regionCounts)) {
    console.log(`${region}: ${count}`);
  }
}

countHeicImagesByRegion();