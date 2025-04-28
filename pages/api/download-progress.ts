

import { NextApiRequest, NextApiResponse } from "next";

// 전역 상태를 공유하는 별도 모듈에서 가져온다고 가정
import { downloadProgress } from "./download-all-images";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    total: downloadProgress.total,
    completed: downloadProgress.completed,
    ready: downloadProgress.ready,
    error: downloadProgress.error,
  });
}