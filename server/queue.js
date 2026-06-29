import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 500, 5000)
});

connection.on("error", (err) => {
  console.error("[redis] Connection error:", err.message);
});

export const uploadQueue = new Queue("uploads", { connection });
