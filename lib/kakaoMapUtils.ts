export const getKakaoMapLink = async (lat: number, lng: number, title: string): Promise<string> => {
  console.log(`Fetching Kakao Map link for ${title} at (${lat}, ${lng})...`);

  const geocodeUrl = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;

  try {
    const response = await fetch(geocodeUrl, {
      method: 'GET',
      headers: {
        Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_API_KEY}`, // Your Kakao API Key here
      },
    });

    const data = await response.json();
    console.log('Geocoding data:', data);

    if (data && data.documents && data.documents.length > 0) {
      const address = data.documents[0]?.address?.address_name;
      if (address) {
        console.log(`Address found: ${address}`);
        return `https://map.kakao.com/link/map/${encodeURIComponent(address)},${lat},${lng}`;
      } else {
        console.error("No address found for the given coordinates.");
        throw new Error("Address not found for coordinates.");
      }
    } else {
      console.error("No data returned from geocoding API.");
      throw new Error("Geocoding API returned no data.");
    }
  } catch (error) {
    console.error("Error fetching Kakao Map link:", error);
    throw error;
  }
};