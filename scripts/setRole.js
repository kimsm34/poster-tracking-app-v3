// setRole.js
require('dotenv').config();
const admin = require('firebase-admin');
const readline = require('readline');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)),
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('역할을 설정할 사용자의 UID를 입력하세요: ', (uid) => {
  rl.question('설정할 역할을 입력하세요 (viewer, editor 또는 admin): ', async (role) => {
    if (role !== 'viewer' && role !== 'editor' && role !== 'admin') {
      console.error('❗ 오류: role은 \"viewer\", \"editor\", 또는 \"admin\"만 가능합니다.');
      rl.close();
      return;
    }

    try {
      // 1. Authentication Custom Claims 설정
      await admin.auth().setCustomUserClaims(uid, { role });
      console.log(`✅ Auth에 role ${role} 설정 완료`);

      // 2. Firestore profiles/{uid} 문서 업데이트
      const db = admin.firestore();
      await db.collection('profiles').doc(uid).set(
        {
          role,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true } // 기존 문서가 있으면 병합
      );
      console.log(`✅ Firestore profiles/${uid}에 role ${role} 저장 완료`);
    } catch (error) {
      console.error('❗ 에러 발생:', error);
    }
    rl.close();
  });
});
