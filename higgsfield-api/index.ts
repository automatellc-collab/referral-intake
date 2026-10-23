import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { config, higgsfield } from "@higgsfield/client/v2";

config({
  credentials: process.env.HF_CREDENTIALS,
});

async function main() {
  console.log("Submitting Seedance 2.5 generation request...");

  const result = await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    {
      input: {
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
        output_format: "mp4",
        generate_audio: true,
      },
      withPolling: true,
    },
  );

  if (result.status === "completed") {
    console.log("Generation complete.");
    console.log("Video URL:", result.video?.url ?? "(no url returned)");
  } else if (result.status === "failed") {
    console.error("Generation failed:", result.error ?? "unknown error");
    process.exit(1);
  } else if (result.status === "canceled") {
    console.error("Request was canceled.");
    process.exit(1);
  } else if (result.status === "moderated") {
    console.error("Request was rejected by content moderation.");
    process.exit(1);
  } else {
    console.error("Unexpected terminal status:", result.status);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
