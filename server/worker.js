import { Worker } from "bullmq";
import { spawn } from "node:child_process";
import prisma from "./prisma.js";
import { connection } from "./queue.js";

const PROGRESS_TTL = 300; // seconds

function runRclone(gdriveId, courseId) {
  return new Promise((resolve, reject) => {
    const dest = `r2:${process.env.R2_BUCKET_NAME}/course-${courseId}/`;
    const proc = spawn(
      "rclone",
      ["copy", `gdrive:${gdriveId}`, dest, "--stats", "2s", "--stats-log-level", "NOTICE"],
      { env: process.env }
    );

    proc.stdout.on("data", (d) => process.stdout.write(`[rclone] ${d}`));

    let buf = "";
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(`[rclone] ${text}`);
      buf += text;

      // Parse "Transferred: N / M, X%" — file count progress
      const m = buf.match(/Transferred:\s+(\d+)\s*\/\s*(\d+)/);
      if (m) {
        const payload = JSON.stringify({ transferred: +m[1], total: +m[2] });
        connection.set(`upload:progress:${courseId}`, payload, "EX", PROGRESS_TTL).catch(() => {});
        buf = "";
      }
    });

    proc.on("close", (code) => {
      connection.del(`upload:progress:${courseId}`).catch(() => {});
      if (code === 0) resolve();
      else reject(new Error(`rclone exited with code ${code}`));
    });
  });
}

const worker = new Worker(
  "uploads",
  async (job) => {
    const { courseId } = job.data;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { videos: true }
    });

    if (!course) throw new Error(`Course ${courseId} not found`);

    await runRclone(course.gdriveId, courseId);

    const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    await Promise.all(
      course.videos.map((video) =>
        prisma.video.update({
          where: { id: video.id },
          data: { r2Url: `${baseUrl}/course-${courseId}/${video.gdriveFileId}` }
        })
      )
    );

    await prisma.course.update({
      where: { id: courseId },
      data: { status: "READY", activatedAt: new Date() }
    });

    console.log(`[worker] Course ${courseId} activated successfully`);
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
  if (job?.data?.courseId) {
    await prisma.course
      .update({ where: { id: job.data.courseId }, data: { status: "NOT_READY" } })
      .catch(console.error);
  }
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err.message);
});

export default worker;
