import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CirclePlay,
  Clock3,
  Download,
  FolderOpen,
  ListVideo,
  Loader2,
  NotebookText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Star,
  Upload,
  Trash2,
  Layers,
  X
} from "lucide-react";

const emptyVideo = () => ({ title: "", gdriveFileId: "", orderIndex: "" });

function parseVtt(text) {
  const cues = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/);
  const toSecs = (ts) => {
    const parts = ts.trim().replace(/,/g, ".").split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  };
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;
    const [startStr, endStr] = lines[timeIdx].split("-->").map((s) => s.split(" ").find(Boolean));
    const textLines = lines.slice(timeIdx + 1).filter((l) => l.trim() && !l.startsWith("NOTE"));
    if (textLines.length) {
      cues.push({ start: toSecs(startStr), end: toSecs(endStr), text: textLines.join(" ").replace(/<[^>]+>/g, "") });
    }
  }
  return cues;
}

function AddCourseModal({ onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gdriveId, setGdriveId] = useState("");
  const [videos, setVideos] = useState([emptyVideo()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateVideo(index, field, value) {
    setVideos((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function addVideoRow() {
    setVideos((prev) => [...prev, emptyVideo()]);
  }

  function removeVideoRow(index) {
    setVideos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        gdriveId,
        videos: videos
          .filter((v) => v.title.trim() && v.gdriveFileId.trim())
          .map((v, i) => ({ ...v, orderIndex: Number(v.orderIndex) || i + 1 }))
      };
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Gagal menyimpan"); return; }
      onSaved();
      onClose();
    } catch {
      setError("Gagal menyimpan course");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Tambah Course</h2>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="action-error">{error}</div>}

          <label className="field-label">
            Judul Course *
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Docker & Kubernetes Fundamentals" />
          </label>

          <label className="field-label">
            Deskripsi
            <input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional" />
          </label>

          <label className="field-label">
            Google Drive Folder ID *
            <input className="field-input" value={gdriveId} onChange={(e) => setGdriveId(e.target.value)} required placeholder="1ABC123xyz456DEF" />
            <small>Dari URL: drive.google.com/drive/folders/<strong>ID_INI</strong></small>
          </label>

          <div className="videos-section">
            <div className="videos-header">
              <span>Video ({videos.length})</span>
              <button type="button" className="add-video-btn" onClick={addVideoRow}>
                <Plus size={14} /> Tambah baris
              </button>
            </div>

            <div className="videos-table-head">
              <span>#</span>
              <span>Judul Video</span>
              <span>Nama File di GDrive</span>
              <span></span>
            </div>

            {videos.map((v, i) => (
              <div key={i} className="video-row">
                <span className="video-num">{i + 1}</span>
                <input
                  className="field-input"
                  value={v.title}
                  onChange={(e) => updateVideo(i, "title", e.target.value)}
                  placeholder="01 - Introduction"
                />
                <input
                  className="field-input"
                  value={v.gdriveFileId}
                  onChange={(e) => updateVideo(i, "gdriveFileId", e.target.value)}
                  placeholder="01-introduction.mp4"
                />
                <button type="button" className="remove-video-btn" onClick={() => removeVideoRow(i)} disabled={videos.length === 1}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Course"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const coursesPerPage = 6;
const defaultCourseMeta = { status: "unwatched", isWishlist: false, updatedAt: null };
const watchStatusOptions = [
  { value: "unwatched", label: "Belum ditonton" },
  { value: "watching", label: "Sedang ditonton" },
  { value: "watched", label: "Sudah ditonton" }
];
const watchStatusLabels = Object.fromEntries(watchStatusOptions.map((o) => [o.value, o.label]));

function formatTime(totalSeconds = 0) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function WatchStatusBadge({ status }) {
  const Icon = status === "watched" ? CheckCircle2 : status === "watching" ? Clock3 : Circle;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={14} />
      {watchStatusLabels[status] ?? watchStatusLabels.unwatched}
    </span>
  );
}

function ActivationBadge({ status }) {
  if (status === "READY") return <span className="activation-badge activation-ready">Ready</span>;
  if (status === "UPLOADING") return <span className="activation-badge activation-uploading">Uploading…</span>;
  return <span className="activation-badge activation-not-ready">Not Ready</span>;
}

function CourseMetaControls({ meta, onStatusChange, onWishlistToggle }) {
  return (
    <div className="course-meta-controls">
      <label>
        <span>Status</span>
        <select value={meta.status} onChange={(e) => onStatusChange(e.target.value)}>
          {watchStatusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <button
        className={`wishlist-button ${meta.isWishlist ? "active" : ""}`}
        onClick={onWishlistToggle}
        type="button"
      >
        <Star size={16} />
        Wishlist
      </button>
    </div>
  );
}

function ImportFromGDriveModal({ onClose, onSaved }) {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(null);
  const [done, setDone] = useState([]);

  useEffect(() => {
    fetch("/api/gdrive/courses")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setCourses(data);
      })
      .catch(() => setError("Gagal menghubungi server"));
  }, []);

  async function handleImport(folder) {
    setImporting(folder.name);
    setError("");
    try {
      const filesRes = await fetch(`/api/gdrive/files?folder=${encodeURIComponent(folder.name)}`);
      const files = await filesRes.json();
      if (files.error) { setError(files.error); setImporting(null); return; }
      if (!files.length) { setError(`Tidak ada video di folder "${folder.name}"`); setImporting(null); return; }

      const payload = {
        title: folder.suggestedTitle,
        gdriveId: folder.name,
        videos: files.map((f, i) => ({ ...f, orderIndex: i + 1 }))
      };
      const saveRes = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) { setError(saved.error ?? "Gagal menyimpan"); setImporting(null); return; }

      setDone((prev) => [...prev, folder.name]);
      setCourses((prev) => prev.map((c) => c.name === folder.name ? { ...c, alreadyImported: true } : c));
    } catch {
      setError("Import gagal");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <h2>Import dari Google Drive</h2>
          <button className="icon-button" onClick={() => { onSaved(); onClose(); }}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="action-error">{error}</div>}
          {!courses && !error && (
            <div className="gdrive-loading">
              <Loader2 size={22} className="spin" />
              <span>Scanning Google Drive...</span>
            </div>
          )}
          {courses && (
            <>
              <p className="gdrive-hint">
                {courses.length} folder ditemukan. Klik <strong>Import</strong> untuk menambahkan ke library.
              </p>
              <div className="gdrive-list">
                {courses.map((folder) => {
                  const isDone = done.includes(folder.name);
                  const isImporting = importing === folder.name;
                  return (
                    <div key={folder.name} className={`gdrive-row ${folder.alreadyImported ? "already" : ""}`}>
                      <div className="gdrive-row-info">
                        <span className="gdrive-folder-name">{folder.suggestedTitle}</span>
                        <span className="gdrive-folder-raw">{folder.name}</span>
                      </div>
                      {folder.alreadyImported ? (
                        <span className="gdrive-badge-done">
                          <CheckCircle2 size={14} /> {isDone ? "Baru diimport" : "Sudah ada"}
                        </span>
                      ) : (
                        <button
                          className="primary-button import-btn"
                          onClick={() => handleImport(folder)}
                          disabled={!!importing}
                        >
                          {isImporting ? <><Loader2 size={14} className="spin" /> Importing...</> : <><Download size={14} /> Import</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const videoRef = useRef(null);
  const transcriptRef = useRef(null);

  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("courses");
  const [coursePage, setCoursePage] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [durations, setDurations] = useState({});
  const [playBlocked, setPlayBlocked] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [savedNoteContent, setSavedNoteContent] = useState("");
  const [noteUpdatedAt, setNoteUpdatedAt] = useState(null);
  const [noteStatus, setNoteStatus] = useState("idle");
  const [courseMeta, setCourseMeta] = useState({});
  const [notesIndex, setNotesIndex] = useState([]);
  const [activating, setActivating] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [actionError, setActionError] = useState("");
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showImportGDrive, setShowImportGDrive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [transcript, setTranscript] = useState([]);

  const courses = library?.courses ?? [];
  const slotsUsed = library?.slotsUsed ?? 0;
  const maxSlots = library?.maxSlots ?? 5;

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? courses[0] ?? null,
    [courses, selectedCourseId]
  );

  const lessons = selectedCourse?.lessons ?? [];
  const currentLesson = lessons[lessonIndex] ?? lessons[0] ?? null;

  const getCourseMeta = useCallback(
    (courseId) => courseMeta[courseId] ?? { ...defaultCourseMeta, courseId },
    [courseMeta]
  );

  const filteredCourses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(needle));
  }, [courses, query]);

  const pageCourses = useMemo(() => {
    if (page === "wishlist") return filteredCourses.filter((c) => getCourseMeta(c.id).isWishlist);
    return filteredCourses;
  }, [filteredCourses, getCourseMeta, page]);

  const totalCoursePages = Math.max(1, Math.ceil(pageCourses.length / coursesPerPage));
  const visibleCourses = useMemo(() => {
    const start = (coursePage - 1) * coursesPerPage;
    return pageCourses.slice(start, start + coursesPerPage);
  }, [coursePage, pageCourses]);

  const notesWithCourses = useMemo(
    () => notesIndex.map((note) => ({ ...note, course: courses.find((c) => c.id === note.courseId) ?? null })),
    [courses, notesIndex]
  );

  const lessonDurations = useMemo(() => {
    const result = new Map();
    for (const lesson of lessons) {
      result.set(lesson.id, durations[lesson.id] || lesson.durationSecs || 0);
    }
    return result;
  }, [durations, lessons]);

  const lessonOffsets = useMemo(() => {
    const offsets = new Map();
    let cursor = 0;
    for (const lesson of lessons) {
      offsets.set(lesson.id, cursor);
      cursor += lessonDurations.get(lesson.id) || 0;
    }
    return offsets;
  }, [lessonDurations, lessons]);

  const totalDuration = useMemo(() => {
    if (!lessons.length) return 0;
    const last = lessons[lessons.length - 1];
    return (lessonOffsets.get(last.id) || 0) + (lessonDurations.get(last.id) || 0);
  }, [lessonDurations, lessonOffsets, lessons]);

  const globalCurrentTime = (lessonOffsets.get(currentLesson?.id) || 0) + currentTime;
  const hasUnsavedNote = noteContent !== savedNoteContent;

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("Gagal membaca library");
      const data = await res.json();
      setLibrary(data);
      setSelectedCourseId((cur) => {
        if (cur && data.courses.some((c) => c.id === cur)) return cur;
        return data.courses[0]?.id ?? null;
      });
      // seed courseMeta from embedded meta
      const seed = {};
      for (const course of data.courses) {
        if (course.meta) seed[course.id] = { courseId: course.id, ...course.meta };
      }
      setCourseMeta((prev) => ({ ...seed, ...prev }));
    } catch (err) {
      setError(err.message || "Gagal membaca library");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotesIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/notes/all");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotesIndex(data.notes ?? []);
    } catch {
      setNotesIndex([]);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
    loadNotesIndex();
  }, [loadLibrary, loadNotesIndex]);

  // Poll library every 5s + upload progress every 2s while any course is UPLOADING
  useEffect(() => {
    const uploadingCourses = library?.courses?.filter((c) => c.status === "UPLOADING") ?? [];
    if (!uploadingCourses.length) return;

    const libraryTimer = setInterval(loadLibrary, 5000);

    const progressTimer = setInterval(async () => {
      const results = await Promise.all(
        uploadingCourses.map((c) =>
          fetch(`/api/courses/${c.id}/progress`).then((r) => r.json()).then((d) => [c.id, d]).catch(() => null)
        )
      );
      setUploadProgress((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    }, 2000);

    return () => { clearInterval(libraryTimer); clearInterval(progressTimer); };
  }, [library, loadLibrary]);

  useEffect(() => { setCoursePage(1); }, [page, query]);
  useEffect(() => {
    setCoursePage((cur) => Math.min(cur, totalCoursePages));
  }, [totalCoursePages]);

  useEffect(() => {
    if (!selectedCourse) return;
    setLessonIndex((cur) => (cur < selectedCourse.lessons.length ? cur : 0));
    setCurrentTime(0);
    setPlayBlocked(false);
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (!selectedCourse) return;
    let cancelled = false;
    async function loadNote() {
      setNoteStatus("loading");
      try {
        const res = await fetch(`/api/notes?courseId=${encodeURIComponent(selectedCourse.id)}`);
        if (!res.ok) throw new Error();
        const note = await res.json();
        if (!cancelled) {
          setNoteContent(note.content ?? "");
          setSavedNoteContent(note.content ?? "");
          setNoteUpdatedAt(note.updatedAt ?? null);
          setNoteStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setNoteContent(""); setSavedNoteContent(""); setNoteUpdatedAt(null); setNoteStatus("error");
        }
      }
    }
    loadNote();
    return () => { cancelled = true; };
  }, [selectedCourse?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentLesson?.r2Url) return;
    video.load();
    const p = video.play();
    if (p) p.then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
  }, [currentLesson?.id]);

  useEffect(() => {
    const panel = transcriptRef.current;
    if (!panel) return;
    const active = panel.querySelector("[data-active='true']");
    if (!active) return;
    const top = active.offsetTop - panel.clientHeight / 2 + active.clientHeight / 2;
    panel.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });

  // Fetch & parse VTT when lesson changes
  useEffect(() => {
    if (!currentLesson?.r2Url) { setTranscript([]); return; }
    const vttUrl = currentLesson.r2Url.replace(/\.[^.]+$/, ".vtt");
    let cancelled = false;
    fetch(vttUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => { if (!cancelled) setTranscript(parseVtt(text)); })
      .catch(() => { if (!cancelled) setTranscript([]); });
    return () => { cancelled = true; };
  }, [currentLesson?.id]);

  function selectCourse(courseId) {
    setSelectedCourseId(courseId);
    setLessonIndex(0);
    setCurrentTime(0);
    setPage("watch");
  }

  function openCourse(courseId, startIndex = 0) {
    setSelectedCourseId(courseId);
    setLessonIndex(startIndex);
    setCurrentTime(0);
    setPage("watch");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCourses() {
    videoRef.current?.pause();
    setPage("courses");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectLesson(index, startAt = 0) {
    setLessonIndex(index);
    setCurrentTime(startAt);
    window.requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = startAt;
        videoRef.current.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
      }
    });
  }

  function previousLesson() { selectLesson(Math.max(0, lessonIndex - 1)); }
  function nextLesson() { if (lessonIndex < lessons.length - 1) selectLesson(lessonIndex + 1); }

  function handleEnded() {
    if (currentLesson) {
      fetch(`/api/videos/${currentLesson.id}/watched`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched: true })
      }).catch(console.error);
    }
    if (lessonIndex < lessons.length - 1) selectLesson(lessonIndex + 1);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !currentLesson || !Number.isFinite(video.duration)) return;
    setDurations((cur) => ({ ...cur, [currentLesson.id]: video.duration }));
  }

  async function activateCourse(courseId) {
    setActionError("");
    setActivating(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error ?? "Gagal activate"); return; }
      await loadLibrary();
    } catch {
      setActionError("Gagal activate course");
    } finally {
      setActivating(null);
    }
  }

  async function deactivateCourse(courseId) {
    setActionError("");
    setDeactivating(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}/deactivate`, { method: "POST" });
      if (!res.ok) { setActionError("Gagal deactivate"); return; }
      await loadLibrary();
    } catch {
      setActionError("Gagal deactivate course");
    } finally {
      setDeactivating(null);
    }
  }

  async function saveNote() {
    if (!selectedCourse) return;
    setNoteStatus("saving");
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourse.id, content: noteContent })
      });
      if (!res.ok) throw new Error();
      const note = await res.json();
      setSavedNoteContent(note.content ?? "");
      setNoteUpdatedAt(note.updatedAt ?? null);
      setNoteStatus("saved");
      loadNotesIndex();
    } catch {
      setNoteStatus("error");
    }
  }

  async function updateCourseMeta(courseId, patch) {
    const current = getCourseMeta(courseId);
    const next = { ...current, ...patch, courseId };
    setCourseMeta((prev) => ({ ...prev, [courseId]: next }));
    try {
      const res = await fetch("/api/course-meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, status: next.status, isWishlist: next.isWishlist })
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setCourseMeta((prev) => ({ ...prev, [courseId]: saved }));
    } catch {
      setCourseMeta((prev) => ({ ...prev, [courseId]: current }));
    }
  }

  if (loading && !library) {
    return (
      <main className="empty-state">
        <RefreshCw className="spin" size={28} />
        <span>Loading library</span>
      </main>
    );
  }

  if (error || courses.length === 0) {
    return (
      <main className="empty-state">
        <FolderOpen size={32} />
        <span>{error || "Belum ada course di database"}</span>
        <div className="empty-state-actions">
          <button className="secondary-button" onClick={() => setShowImportGDrive(true)}>
            <Download size={16} /> Import GDrive
          </button>
          <button className="primary-button" onClick={() => setShowAddCourse(true)}>
            <Plus size={16} /> Tambah Manual
          </button>
          <button className="icon-button" onClick={loadLibrary} title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
        {showAddCourse && (
          <AddCourseModal onClose={() => setShowAddCourse(false)} onSaved={loadLibrary} />
        )}
        {showImportGDrive && (
          <ImportFromGDriveModal onClose={() => setShowImportGDrive(false)} onSaved={loadLibrary} />
        )}
      </main>
    );
  }

  return (
    <main className={`app-shell ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      {isSidebarOpen && (
        <aside className="course-sidebar" aria-label="Courses">
          <div className="brand-row">
            <div>
              <h1>Learning Player</h1>
              <p>{courses.length} courses</p>
            </div>
            <div className="sidebar-actions">
              <span className="slot-indicator">
                <Layers size={14} />
                {slotsUsed}/{maxSlots}
              </span>
              <button className="icon-button" onClick={loadLibrary} title="Refresh" aria-label="Refresh">
                <RefreshCw size={18} />
              </button>
              <button className="icon-button" onClick={() => setIsSidebarOpen(false)} title="Close sidebar" aria-label="Close sidebar">
                <PanelLeftClose size={18} />
              </button>
            </div>
          </div>

          <label className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search course"
              type="search"
            />
          </label>

          <nav className="sidebar-nav" aria-label="Library pages">
            <button className={page === "courses" ? "active" : ""} onClick={() => setPage("courses")}>
              <BookOpen size={16} /> Courses
            </button>
            <button className={page === "wishlist" ? "active" : ""} onClick={() => setPage("wishlist")}>
              <Star size={16} /> Wishlist
            </button>
            <button className={page === "notes" ? "active" : ""} onClick={() => { loadNotesIndex(); setPage("notes"); }}>
              <NotebookText size={16} /> Notes
            </button>
          </nav>

          <div className="course-list">
            {filteredCourses.map((course) => (
              <button
                key={course.id}
                className={`course-item ${course.id === selectedCourse?.id ? "active" : ""}`}
                onClick={() => selectCourse(course.id)}
              >
                <FolderOpen size={18} />
                <span>
                  <strong>{course.title}</strong>
                  <small>
                    {course.lessonCount} parts · <ActivationBadge status={course.status} />
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <section className="player-column">
        {page !== "watch" ? (
          <>
            <header className="topbar">
              {!isSidebarOpen && (
                <button className="icon-button" onClick={() => setIsSidebarOpen(true)} title="Open sidebar" aria-label="Open sidebar">
                  <PanelLeftOpen size={19} />
                </button>
              )}
              <div>
                <p>{page === "notes" ? "Saved notes" : "Library"}</p>
                <h2>{page === "wishlist" ? "Wishlist" : page === "notes" ? "Notes" : "Courses"}</h2>
              </div>
              {page === "courses" && (
                <div className="topbar-actions">
                  <button className="secondary-button" onClick={() => setShowImportGDrive(true)}>
                    <Download size={16} /> Import GDrive
                  </button>
                  <button className="primary-button" onClick={() => setShowAddCourse(true)}>
                    <Plus size={16} /> Manual
                  </button>
                </div>
              )}
            </header>

            {actionError && (
              <div className="action-error">{actionError}</div>
            )}

            {page === "notes" ? (
              <section className="notes-page">
                {notesWithCourses.length === 0 ? (
                  <div className="empty-panel"><NotebookText size={28} /><span>Belum ada notes tersimpan.</span></div>
                ) : (
                  notesWithCourses.map((note) => (
                    <article className="note-card" key={note.courseId}>
                      <div className="note-card-header">
                        <div>
                          <p>Course #{note.courseId}</p>
                          <h3>{note.course?.title ?? `Course ${note.courseId}`}</h3>
                        </div>
                        {note.course && <WatchStatusBadge status={getCourseMeta(note.course.id).status} />}
                      </div>
                      <pre>{note.content}</pre>
                      <div className="note-card-actions">
                        <span>{note.updatedAt ? `Updated ${note.updatedAt}` : ""}</span>
                        {note.course && (
                          <button className="primary-button" onClick={() => openCourse(note.course.id)}>
                            <CirclePlay size={18} /> Open Course
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </section>
            ) : (
              <>
                <section className="course-page">
                  {visibleCourses.length === 0 ? (
                    <div className="empty-panel">
                      <Star size={28} />
                      <span>{page === "wishlist" ? "Wishlist masih kosong." : "Course tidak ditemukan."}</span>
                    </div>
                  ) : (
                    visibleCourses.map((course) => {
                      const meta = getCourseMeta(course.id);
                      const isActivating = activating === course.id;
                      const isDeactivating = deactivating === course.id;
                      return (
                        <article className="course-card" key={course.id}>
                          <div className="course-card-header">
                            <div className="course-card-icon"><BookOpen size={22} /></div>
                            <div>
                              <p>{course.description ?? "Course"}</p>
                              <h3>{course.title}</h3>
                            </div>
                          </div>

                          <div className="course-meta">
                            <span>{course.lessonCount} parts</span>
                            {course.totalSizeMb && <span>{course.totalSizeMb.toFixed(1)} MB</span>}
                            <ActivationBadge status={course.status} />
                            <WatchStatusBadge status={meta.status} />
                          </div>

                          {course.status === "UPLOADING" && (() => {
                            const prog = uploadProgress[course.id];
                            const pct = prog?.percent ?? 0;
                            const transferred = prog?.transferred ?? 0;
                            const total = prog?.total ?? null;
                            return (
                              <div className="upload-progress">
                                <div className="upload-progress-bar">
                                  <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="upload-progress-label">
                                  {total
                                    ? `${transferred} / ${total} file · ${pct}%`
                                    : "Menghitung…"}
                                </span>
                              </div>
                            );
                          })()}

                          <CourseMetaControls
                            meta={meta}
                            onStatusChange={(status) => updateCourseMeta(course.id, { status })}
                            onWishlistToggle={() => updateCourseMeta(course.id, { isWishlist: !meta.isWishlist })}
                          />

                          <div className="course-preview-list">
                            {course.lessons.slice(0, 5).map((lesson, index) => (
                              <button
                                key={lesson.id}
                                className="course-preview-item"
                                onClick={() => openCourse(course.id, index)}
                              >
                                <span>{String(index + 1).padStart(2, "0")}</span>
                                <strong>{lesson.title}</strong>
                              </button>
                            ))}
                          </div>

                          <div className="course-card-actions">
                            {course.status === "NOT_READY" && (
                              <button
                                className="activate-button"
                                onClick={() => activateCourse(course.id)}
                                disabled={isActivating || slotsUsed >= maxSlots}
                                title={slotsUsed >= maxSlots ? "Slot penuh" : "Activate"}
                              >
                                <Upload size={16} />
                                {isActivating ? "Activating…" : "Activate"}
                              </button>
                            )}
                            {(course.status === "UPLOADING" || course.status === "READY") && (
                              <button
                                className="deactivate-button"
                                onClick={() => deactivateCourse(course.id)}
                                disabled={isDeactivating || course.status === "UPLOADING"}
                              >
                                <Trash2 size={16} />
                                {isDeactivating ? "Removing…" : "Deactivate"}
                              </button>
                            )}
                            <button
                              className="primary-button course-open-button"
                              onClick={() => openCourse(course.id)}
                            >
                              <CirclePlay size={18} />
                              Open Course
                            </button>
                            <button
                              className="delete-course-button"
                              title="Hapus course dari database"
                              onClick={() => {
                                if (confirm(`Hapus "${course.title}" dari database? File di R2 tidak ikut terhapus.`)) {
                                  fetch(`/api/courses/${course.id}`, { method: "DELETE" })
                                    .then(() => loadLibrary())
                                    .catch(() => setActionError("Gagal menghapus course"));
                                }
                              }}
                              disabled={course.status === "UPLOADING"}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </section>

                <nav className="pagination-bar" aria-label="Course pages">
                  <button
                    className="control-button"
                    onClick={() => setCoursePage((c) => Math.max(1, c - 1))}
                    disabled={coursePage === 1}
                  >Previous</button>
                  <span>Page {coursePage} / {totalCoursePages} · {pageCourses.length} courses</span>
                  <button
                    className="control-button"
                    onClick={() => setCoursePage((c) => Math.min(totalCoursePages, c + 1))}
                    disabled={coursePage === totalCoursePages}
                  >Next</button>
                </nav>
              </>
            )}
          </>
        ) : (
          <>
            <header className="topbar">
              {!isSidebarOpen && (
                <button className="icon-button" onClick={() => setIsSidebarOpen(true)} title="Open sidebar" aria-label="Open sidebar">
                  <PanelLeftOpen size={19} />
                </button>
              )}
              <button className="icon-button" onClick={showCourses} title="Courses" aria-label="Courses">
                <ArrowLeft size={19} />
              </button>
              <button className="icon-button mobile-only" onClick={() => setIsPlaylistOpen((v) => !v)} title="Playlist" aria-label="Playlist">
                <ListVideo size={19} />
              </button>
              <div>
                <p>
                  {selectedCourse?.description ?? "Course"}
                  {" · "}
                  <ActivationBadge status={selectedCourse?.status} />
                </p>
                <h2>{selectedCourse?.title}</h2>
                {selectedCourse && (
                  <div className="watch-course-meta">
                    <WatchStatusBadge status={getCourseMeta(selectedCourse.id).status} />
                    <CourseMetaControls
                      meta={getCourseMeta(selectedCourse.id)}
                      onStatusChange={(status) => updateCourseMeta(selectedCourse.id, { status })}
                      onWishlistToggle={() =>
                        updateCourseMeta(selectedCourse.id, { isWishlist: !getCourseMeta(selectedCourse.id).isWishlist })
                      }
                    />
                    {selectedCourse.status === "NOT_READY" && (
                      <button
                        className="activate-button"
                        onClick={() => activateCourse(selectedCourse.id)}
                        disabled={activating === selectedCourse.id || slotsUsed >= maxSlots}
                      >
                        <Upload size={15} />
                        {activating === selectedCourse.id ? "Activating…" : "Activate"}
                      </button>
                    )}
                    {selectedCourse.status === "READY" && (
                      <button
                        className="deactivate-button"
                        onClick={() => deactivateCourse(selectedCourse.id)}
                        disabled={deactivating === selectedCourse.id}
                      >
                        <Trash2 size={15} />
                        {deactivating === selectedCourse.id ? "Removing…" : "Deactivate"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </header>

            <div className="watch-layout">
              <section className="watch-main">
                <div className="video-stage">
                  {currentLesson?.r2Url ? (
                    <>
                      <video
                        key={currentLesson.id}
                        ref={videoRef}
                        className="video-player"
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        onEnded={handleEnded}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onLoadedMetadata={handleLoadedMetadata}
                      >
                        <source src={currentLesson.r2Url} type="video/mp4" />
                      </video>
                      {playBlocked && (
                        <button className="play-overlay" onClick={() => videoRef.current?.play().then(() => setPlayBlocked(false))}>
                          <CirclePlay size={42} /> Play
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="video-not-ready">
                      {selectedCourse?.status === "UPLOADING" ? (
                        <>
                          <RefreshCw className="spin" size={28} />
                          <span>Sedang upload ke CDN…</span>
                          <small>Halaman akan refresh otomatis</small>
                        </>
                      ) : (
                        <>
                          <Upload size={28} />
                          <span>Course belum diaktifkan</span>
                          {slotsUsed < maxSlots ? (
                            <button
                              className="activate-button"
                              onClick={() => activateCourse(selectedCourse.id)}
                              disabled={activating === selectedCourse?.id}
                            >
                              <Upload size={15} /> Activate Course
                            </button>
                          ) : (
                            <small>Slot penuh ({slotsUsed}/{maxSlots}). Deactivate course lain dulu.</small>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="control-strip">
                  <button className="control-button" onClick={previousLesson} disabled={lessonIndex === 0}>
                    <SkipBack size={18} /> Previous
                  </button>
                  <div className="now-playing">
                    <strong>{currentLesson?.title}</strong>
                    <span>Part {lessonIndex + 1} / {lessons.length} · {formatTime(globalCurrentTime)} / {formatTime(totalDuration)}</span>
                  </div>
                  <button className="control-button" onClick={nextLesson} disabled={lessonIndex >= lessons.length - 1}>
                    Next <SkipForward size={18} />
                  </button>
                </div>

                <section className="transcript-panel">
                  <div className="section-heading">
                    <Captions size={18} />
                    <h3>Transcript</h3>
                  </div>
                  <div className="transcript-list" ref={transcriptRef}>
                    {transcript.length === 0 ? (
                      <div className="muted-line">Transcript tidak tersedia untuk video ini.</div>
                    ) : (
                      transcript.map((cue, i) => {
                        const isActive = currentTime >= cue.start && currentTime < cue.end;
                        return (
                          <button
                            key={i}
                            className={`transcript-cue ${isActive ? "active" : ""}`}
                            data-active={isActive}
                            onClick={() => { if (videoRef.current) videoRef.current.currentTime = cue.start; }}
                          >
                            <time>
                              {Math.floor(cue.start / 60).toString().padStart(2, "0")}:{Math.floor(cue.start % 60).toString().padStart(2, "0")}
                            </time>
                            <span>{cue.text}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="notes-panel">
                  <div className="section-heading notes-heading">
                    <div><NotebookText size={18} /><h3>Notes</h3></div>
                    <span>
                      {noteStatus === "loading" ? "Loading"
                        : noteStatus === "saving" ? "Saving"
                        : noteStatus === "error" ? "Error"
                        : hasUnsavedNote ? "Unsaved"
                        : noteUpdatedAt ? `Saved ${noteUpdatedAt}`
                        : "Not saved"}
                    </span>
                  </div>
                  <textarea
                    className="notes-editor"
                    value={noteContent}
                    onChange={(e) => { setNoteContent(e.target.value); if (noteStatus !== "loading") setNoteStatus("idle"); }}
                    placeholder="Tulis catatan untuk course ini..."
                    spellCheck="false"
                  />
                  <div className="notes-actions">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        const stamp = `[${formatTime(globalCurrentTime)}] ${currentLesson?.title ?? ""}`;
                        setNoteContent((c) => (c ? `${c}\n${stamp}\n` : `${stamp}\n`));
                      }}
                    >
                      Add Timestamp
                    </button>
                    <button
                      className="primary-button notes-save-button"
                      onClick={saveNote}
                      disabled={noteStatus === "saving" || !hasUnsavedNote}
                    >
                      <Save size={18} /> Save Notes
                    </button>
                  </div>
                </section>
              </section>

              <aside className={`playlist-panel ${isPlaylistOpen ? "open" : ""}`}>
                <div className="section-heading">
                  <ListVideo size={18} />
                  <h3>Playlist</h3>
                </div>
                <div className="lesson-list">
                  {lessons.map((lesson, index) => (
                    <button
                      key={lesson.id}
                      className={`lesson-item ${index === lessonIndex ? "active" : ""} ${lesson.watched ? "lesson-watched" : ""}`}
                      onClick={() => selectLesson(index)}
                    >
                      <span className="lesson-index">
                        {lesson.watched ? <CheckCircle2 size={14} /> : String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="lesson-name">
                        <strong>{lesson.title}</strong>
                        <small>{formatTime(lessonDurations.get(lesson.id))}</small>
                      </span>
                      {index === lessonIndex ? <ChevronRight size={18} /> : <ChevronLeft className="ghost-chevron" size={18} />}
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </section>

      {showAddCourse && (
        <AddCourseModal
          onClose={() => setShowAddCourse(false)}
          onSaved={loadLibrary}
        />
      )}
      {showImportGDrive && (
        <ImportFromGDriveModal
          onClose={() => setShowImportGDrive(false)}
          onSaved={loadLibrary}
        />
      )}
    </main>
  );
}

export default App;
