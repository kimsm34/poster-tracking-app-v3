import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

async function fetchWithRetry(url: string, retries = 3): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.buffer();
  } catch (e) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      console.warn(`Retrying fetch... (${4 - retries} attempt)`);
      return fetchWithRetry(url, retries - 1);
    }
    throw e;
  }
}

sharp.cache(false);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url: imageUrl } = req.query;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  // v is used only for cache-busting on the client side and is ignored by the server
  const version = req.query.v;

  const cleanUrl = imageUrl;

  try {
    const buffer = await fetchWithRetry(cleanUrl);

    let imageBuffer: Buffer;

    try {
      imageBuffer = await sharp(buffer)
        .rotate()
        .resize({ width: 600 })
        .toFormat('jpeg', { quality: 5 })
        .toBuffer();
    } catch (err) {
      // Fallback to heic-convert for HEIC images
      console.warn('🟡 sharp failed, trying heic-convert fallback:', err);

      try {
        const heicBuffer = await heicConvert({
          buffer,
          format: 'JPEG',
          quality: 0.8,
        });

        imageBuffer = await sharp(heicBuffer)
          .resize({ width: 600 })
          .jpeg({ quality: 5 })
          .toBuffer();
      } catch (fallbackErr) {
        console.error('🔴 HEIC conversion also failed:', fallbackErr);
        throw fallbackErr;
      }
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(imageBuffer);
  } catch (e: any) {
    console.error('🔥 image proxy failed:', e);
    if (e.name === 'AbortError') {
      res.status(504).send('Image fetch timed out');
    } else {
      res.status(500).send('Failed to fetch or process image');
    }
  }
}