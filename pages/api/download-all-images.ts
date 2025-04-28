import { NextApiRequest, NextApiResponse } from "next";
const admin = require("firebase-admin");
import JSZip from "jszip";
import fetch from "node-fetch";
import sharp from "sharp";
import heicConvert from "heic-convert";

export let downloadProgress = {
  total: 0,
  completed: 0,
  ready: false,
  error: false,
  zipBuffer: null as Buffer | null,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    downloadProgress.total = 0;
    downloadProgress.completed = 0;
    downloadProgress.ready = false;
    downloadProgress.error = false;
    downloadProgress.zipBuffer = null;


    const pinsSnapshot = await db.collection("pins").get();
    console.log(`🔍 Found ${pinsSnapshot.docs.length} pins`);

    let totalImages = 0;
    for (const doc of pinsSnapshot.docs) {
      const pin = doc.data();
      for (const status of Object.keys(pin.imagesByStatus || {})) {
        totalImages += (pin.imagesByStatus[status] || []).length;
      }
    }
    downloadProgress.total = totalImages;

    const zip = new JSZip();

    const statusCounters = new Map<string, number>();
    for (const doc of pinsSnapshot.docs) {
      const pin = doc.data();
      const region = pin.region || "지역";
      const dong = pin.dong || "동";
      const number = pin.number || "번호";
      console.log(`📍 Processing pin: ${region}-${dong}-${number}`);

      for (const status of Object.keys(pin.imagesByStatus || {})) {
        const images = pin.imagesByStatus[status] || [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const key = `${region}-${dong}-${status}`;
          const count = (statusCounters.get(key) || 0) + 1;
          statusCounters.set(key, count);
          const filename = `${region}-${dong}-${status}${count}.jpg`;
          console.log(`📸 Fetching image: ${img.url}`);

          try {
            const response = await fetch(img.url);
            const buffer = await response.buffer();
            let finalBuffer: Buffer;

            try {
              finalBuffer = await sharp(buffer).rotate().jpeg({ quality: 40 }).toBuffer();
              console.log(`✅ Compressed with sharp: ${filename}`);
            } catch (err) {
              console.warn(`🟡 sharp failed for ${filename}, trying heic-convert...`);
              try {
                finalBuffer = await heicConvert({
                  buffer,
                  format: "JPEG",
                  quality: 0.4,
                });
                console.log(`✅ Converted with heic-convert: ${filename}`);
              } catch (heicErr) {
                console.error(`❌ Both sharp and heic-convert failed for ${filename}`);
                throw heicErr;
              }
            }

            zip.file(filename, finalBuffer);
            downloadProgress.completed++;
          } catch (e) {
            console.error(`❌ Error with image (${filename}): ${img.url}`);
            console.error(e);
          }
        }
      }
    }

    const zipped = await zip.generateAsync({ type: "nodebuffer" });
    console.log(`✅ Zip file generated, size: ${zipped.byteLength} bytes`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=all_photos.zip");
    res.send(zipped);

    downloadProgress.ready = true;
    downloadProgress.zipBuffer = zipped;
  } catch (error) {
    console.error("Download all images failed", error);
    downloadProgress.error = true;
    res.status(500).json({ error: "Failed to download images." });
  }
}