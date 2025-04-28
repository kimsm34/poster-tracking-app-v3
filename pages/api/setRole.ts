import type { NextApiRequest, NextApiResponse } from 'next';
import * as admin from 'firebase-admin';

// 1. 환경 변수에서 서비스 계정 키를 읽어옵니다.
const serviceAccount = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
);

// 2. Firebase Admin SDK 초기화
// admin.apps.length를 체크하여 이미 초기화되었으면 건너뜁니다.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, role, regions } = req.body;

  if (!uid || !role) {
    return res.status(400).json({ error: 'Missing uid or role' });
  }
  if (role !== 'admin' && (!regions || !Array.isArray(regions) || regions.length === 0)) {
    return res.status(400).json({ error: 'Missing regions (must be a non-empty array) for non-admin users' });
  }

  try {
    await admin.auth().setCustomUserClaims(uid, { role, regions });
    return res.status(200).json({ message: `Role ${role} and regions ${regions} set for user ${uid}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to set role' });
  }
}
