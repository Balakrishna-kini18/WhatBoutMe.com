import { config } from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

config(); // load .env

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function test() {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        type: 'authenticated',
      },
      process.env.CLOUDINARY_API_SECRET || ''
    );

    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`;
    
    console.log("Signature:", signature);
    
    const formData = new FormData();
    const videoBuffer = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACsBtZGF0AAACrgYF//+//7xhbWlu", "base64");
    const blob = new Blob([videoBuffer], { type: "video/mp4" });
    
    formData.append("file", blob, "test.mp4");
    formData.append("type", "authenticated");
    formData.append("signature", signature);
    formData.append("api_key", process.env.CLOUDINARY_API_KEY as string);
    formData.append("timestamp", timestamp.toString());
    
    console.log("Uploading to", uploadUrl);
    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData
    });
    
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();
