import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import prisma from "./prisma.js";
import { uploadQueue } from "./queue.js";
import "./worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 5173);
const isProduction = process.env.NODE_ENV === "production";
const MAX_ACTIVE_COURSES = Number(process.env.MAX_ACTIVE_COURSES ?? 5);

const app = express();
app.use(express.json({ limit: "1mb" }));

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT ?? "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? ""
  }
});

// ── Library ──────────────────────────────────────────────

app.get("/api/library", async (_req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        videos: { orderBy: { orderIndex: "asc" } },
        note: true,
        meta: true
      },
      orderBy: { createdAt: "asc" }
    });

    const slotsUsed = courses.filter((c) => c.status !== "NOT_READY").length;

    res.json({
      slotsUsed,
      maxSlots: MAX_ACTIVE_COURSES,
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnail: course.thumbnail,
        status: course.status,
        activatedAt: course.activatedAt,
        totalSizeMb: course.totalSizeMb,
        lessonCount: course.videos.length,
        meta: course.meta
          ? {
              status: course.meta.status.toLowerCase(),
              isWishlist: course.meta.isWishlist,
              updatedAt: course.meta.updatedAt
            }
          : { status: "unwatched", isWishlist: false, updatedAt: null },
        lessons: course.videos.map((v) => ({
          id: v.id,
          title: v.title,
          orderIndex: v.orderIndex,
          r2Url: v.r2Url,
          durationSecs: v.durationSecs,
          watched: v.watched,
          watchedAt: v.watchedAt
        }))
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ── Course Activation ─────────────────────────────────────

app.post("/api/courses/:id/activate", async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    if (!courseId) return res.status(400).json({ error: "Invalid course id" });

    const activeCount = await prisma.course.count({
      where: { status: { in: ["UPLOADING", "READY"] } }
    });

    if (activeCount >= MAX_ACTIVE_COURSES) {
      return res.status(409).json({
        error: `Slot penuh (${MAX_ACTIVE_COURSES} aktif). Deactivate course lain dulu.`
      });
    }

    const course = await prisma.course.update({
      where: { id: courseId },
      data: { status: "UPLOADING" }
    });

    await uploadQueue.add("upload", { courseId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 }
    });

    res.json({ status: course.status });
  } catch (err) {
    next(err);
  }
});

app.post("/api/courses/:id/deactivate", async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    if (!courseId) return res.status(400).json({ error: "Invalid course id" });

    try {
      const listed = await r2.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
          Prefix: `course-${courseId}/`
        })
      );

      if (listed.Contents?.length) {
        await r2.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) }
          })
        );
      }
    } catch (r2Err) {
      console.error("[r2] Delete error:", r2Err.message);
    }

    await prisma.video.updateMany({ where: { courseId }, data: { r2Url: null } });

    const course = await prisma.course.update({
      where: { id: courseId },
      data: { status: "NOT_READY", activatedAt: null }
    });

    res.json({ status: course.status });
  } catch (err) {
    next(err);
  }
});

// ── Videos ────────────────────────────────────────────────

app.patch("/api/videos/:id/watched", async (req, res, next) => {
  try {
    const videoId = Number(req.params.id);
    const watched = Boolean(req.body?.watched);
    const video = await prisma.video.update({
      where: { id: videoId },
      data: { watched, watchedAt: watched ? new Date() : null }
    });
    res.json({ id: video.id, watched: video.watched });
  } catch (err) {
    next(err);
  }
});

// ── Notes ─────────────────────────────────────────────────

app.get("/api/notes/all", async (_req, res, next) => {
  try {
    const notes = await prisma.courseNote.findMany({
      where: { NOT: { content: "" } },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ notes: notes.map((n) => ({ courseId: n.courseId, content: n.content, updatedAt: n.updatedAt })) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/notes", async (req, res, next) => {
  try {
    const courseId = Number(req.query.courseId);
    if (!courseId) return res.status(400).json({ error: "courseId required" });
    const note = await prisma.courseNote.findUnique({ where: { courseId } });
    res.json({ courseId, content: note?.content ?? "", updatedAt: note?.updatedAt ?? null });
  } catch (err) {
    next(err);
  }
});

app.put("/api/notes", async (req, res, next) => {
  try {
    const courseId = Number(req.body?.courseId);
    const content = String(req.body?.content ?? "");
    if (!courseId) return res.status(400).json({ error: "courseId required" });
    if (content.length > 200_000) return res.status(413).json({ error: "Note too large" });

    const note = await prisma.courseNote.upsert({
      where: { courseId },
      create: { courseId, content },
      update: { content }
    });
    res.json({ courseId: note.courseId, content: note.content, updatedAt: note.updatedAt });
  } catch (err) {
    next(err);
  }
});

// ── Course Meta (watch status + wishlist) ─────────────────

app.get("/api/course-meta", async (_req, res, next) => {
  try {
    const allMeta = await prisma.courseMeta.findMany();
    const meta = Object.fromEntries(
      allMeta.map((m) => [
        m.courseId,
        { courseId: m.courseId, status: m.status.toLowerCase(), isWishlist: m.isWishlist, updatedAt: m.updatedAt }
      ])
    );
    res.json({ meta });
  } catch (err) {
    next(err);
  }
});

app.put("/api/course-meta", async (req, res, next) => {
  try {
    const courseId = Number(req.body?.courseId);
    const rawStatus = String(req.body?.status ?? "unwatched");
    const isWishlist = Boolean(req.body?.isWishlist);

    if (!courseId) return res.status(400).json({ error: "courseId required" });
    if (!["unwatched", "watching", "watched"].includes(rawStatus))
      return res.status(400).json({ error: "Invalid status" });

    const status = rawStatus.toUpperCase();
    const meta = await prisma.courseMeta.upsert({
      where: { courseId },
      create: { courseId, status, isWishlist },
      update: { status, isWishlist }
    });

    res.json({
      courseId: meta.courseId,
      status: meta.status.toLowerCase(),
      isWishlist: meta.isWishlist,
      updatedAt: meta.updatedAt
    });
  } catch (err) {
    next(err);
  }
});

// ── Frontend ──────────────────────────────────────────────

if (isProduction) {
  app.use(express.static(path.join(rootDir, "dist")));
  app.use((_req, res) => res.sendFile(path.join(rootDir, "dist", "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(port, () => {
  console.log(`Learning app running at http://localhost:${port}`);
});
