import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

// First fetch signature from local backend
async function test() {
  try {
    console.log("Fetching signature...");
    const sigRes = await fetch("http://localhost:4000/media/upload-signature", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.TEST_TOKEN
      }
    });
    
    if (!sigRes.ok) {
      console.log("Failed to get signature", await sigRes.text());
      return;
    }
    
    const sigData = await sigRes.json();
    console.log("Signature data:", sigData);
    
    // Create a dummy file (1x1 pixel or simple text)
    // Cloudinary might reject text for video/upload. Let's just create a dummy mp4 or use raw text?
    // Let's use a tiny base64 video or just upload an image to /auto/upload
    // Wait, the signature is strictly for 'video'.
    // We can use a 1-second silent mp4. But for testing, let's just see if Cloudinary rejects the signature immediately.
    
    const formData = new FormData();
    // Use a small valid video buffer
    const videoBuffer = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACsBtZGF0AAACrgYF//+//7xhbWlu", "base64");
    const blob = new Blob([videoBuffer], { type: "video/mp4" });
    
    formData.append("file", blob, "test.mp4");
    formData.append("type", "authenticated");
    formData.append("signature", sigData.signature);
    formData.append("api_key", sigData.apiKey);
    formData.append("timestamp", sigData.timestamp);
    
    console.log("Uploading to Cloudinary...");
    const uploadRes = await fetch(sigData.uploadUrl, {
      method: "POST",
      body: formData
    });
    
    const text = await uploadRes.text();
    console.log("Cloudinary response status:", uploadRes.status);
    console.log("Cloudinary response body:", text);
    
  } catch (e) {
    console.error(e);
  }
}

test();
