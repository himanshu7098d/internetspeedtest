export interface SpeedTestResult {
  pingMs: number;
  downloadMbps: number;
  uploadMbps: number;
}

export async function runPingTest(): Promise<number> {
  const pings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    try {
      await fetch('/api/ping', { cache: 'no-store' });
      const end = performance.now();
      pings.push(end - start);
    } catch (e) {
      console.error("Ping failed", e);
    }
  }
  if (pings.length === 0) return 0;
  // Return average ping
  return pings.reduce((a, b) => a + b, 0) / pings.length;
}

export async function runDownloadTest(onProgress?: (mbps: number) => void): Promise<number> {
  const sizeMb = 15; // 15MB test file
  const sizeBytes = sizeMb * 1024 * 1024;
  
  const start = performance.now();
  try {
    const response = await fetch(`/api/download?size=${sizeBytes}`, { cache: 'no-store' });
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    let receivedBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        const currentMs = performance.now() - start;
        if (currentMs > 0 && onProgress) {
          const currentMbps = (receivedBytes * 8) / (currentMs / 1000) / 1000000;
          onProgress(currentMbps);
        }
      }
    }
    
    const end = performance.now();
    const durationSeconds = (end - start) / 1000;
    return (sizeBytes * 8) / durationSeconds / 1000000;
  } catch (e) {
    console.error("Download test failed", e);
    return 0;
  }
}

export async function runUploadTest(onProgress?: (mbps: number) => void): Promise<number> {
  const sizeMb = 5; // 5MB test file
  const sizeBytes = sizeMb * 1024 * 1024;
  
  // Generate random data
  const data = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  
  const start = performance.now();
  try {
    // We can't easily track upload progress with fetch, so we'll simulate progress updates
    // while the upload is happening, and then calculate the final speed.
    let isUploading = true;
    const progressInterval = setInterval(() => {
      if (isUploading && onProgress) {
        const currentMs = performance.now() - start;
        // Estimate progress based on a typical 10Mbps upload speed
        const estimatedBytes = (10 * 1000000 * (currentMs / 1000)) / 8;
        const cappedBytes = Math.min(estimatedBytes, sizeBytes * 0.9);
        const currentMbps = (cappedBytes * 8) / (currentMs / 1000) / 1000000;
        onProgress(currentMbps);
      }
    }, 200);

    await fetch('/api/upload', {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
    
    isUploading = false;
    clearInterval(progressInterval);
    
    const end = performance.now();
    const durationSeconds = (end - start) / 1000;
    return (sizeBytes * 8) / durationSeconds / 1000000;
  } catch (e) {
    console.error("Upload test failed", e);
    return 0;
  }
}

export function calculateScores(download: number, upload: number, ping: number) {
  // Gaming: Needs low ping (< 50ms) and decent download (> 10Mbps)
  let gaming = 100;
  if (ping > 20) gaming -= (ping - 20) * 0.5;
  if (download < 25) gaming -= (25 - download) * 2;
  
  // Streaming: Needs good download (4K needs ~25Mbps)
  let streaming = 100;
  if (download < 50) streaming -= (50 - download) * 1.5;
  
  // Video Call: Needs good upload (> 5Mbps) and stable ping
  let videoCall = 100;
  if (upload < 10) videoCall -= (10 - upload) * 5;
  if (ping > 50) videoCall -= (ping - 50) * 0.5;
  
  return {
    gaming: Math.max(0, Math.min(100, Math.round(gaming))),
    streaming: Math.max(0, Math.min(100, Math.round(streaming))),
    videoCall: Math.max(0, Math.min(100, Math.round(videoCall)))
  };
}
