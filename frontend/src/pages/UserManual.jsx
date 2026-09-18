import { useState } from "react";
import Breadcrumb from "../components/Breadcrumb";

// Import the local video files so Vite/webpack bundles them and gives us
// the correct hashed URL at runtime.
import defaultVideo from "../assets/videos/default.mp4";
import loginVideo from "../assets/videos/login.mp4";

// Shared thumbnail/poster image shown on every card and as the video
// poster before playback starts.
import defaultThumb from "../assets/videos/default-video.png";

/**
 * ============================================================================
 * USER MANUAL — Training Video Library (self-hosted MP4)
 * ============================================================================
 * Shown to ADMIN / TEACHER / FINANCE / STUDENT (see App.jsx route guard).
 *
 * Videos live under src/assets/videos/ and are imported above. Every card
 * points to `defaultVideo` unless it needs a specific file — the login
 * walkthrough, for example, uses `loginVideo`.
 *
 * The card thumbnail and the modal's pre-play poster both use
 * `default-video.png` from the same folder. If you later want per-video
 * thumbnails, add `import xThumb from "../assets/videos/x.png";` at the top
 * and set `thumbnail: xThumb` on that VIDEOS entry.
 *
 * `category` is just used for the filter pills above the grid — edit
 * CATEGORIES below if you rename or add categories.
 * ============================================================================
 */

const CATEGORIES = ["All", "Getting Started", "Academics", "Finance", "Admin"];

const VIDEOS = [
  {
    id: 1,
    title: "Getting Started: Logging In & Navigating the Portal",
    description:
      "A quick walkthrough of logging in, resetting a forgotten password, and finding your way around the dashboard, sidebar, and notifications.",
    category: "Getting Started",
    videoSrc: loginVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 2,
    title: "Admin Dashboard Overview",
    description:
      "Tour of the admin dashboard — key stats, quick links, and where to find students, classrooms, and reports.",
    category: "Admin",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 3,
    title: "Managing Students & Classrooms",
    description:
      "How to add new students, assign them to classrooms, and keep student records up to date.",
    category: "Admin",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 4,
    title: "Mark Entry & Exam Rankings",
    description:
      "Step-by-step guide for teachers and admins on entering exam marks and generating class rankings.",
    category: "Academics",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 5,
    title: "Timetable Management",
    description:
      "Building and editing the school timetable, allocating teachers to subjects, and resolving clashes.",
    category: "Admin",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 6,
    title: "Fee Structures & M-Pesa Payments",
    description:
      "Creating fee structures per grade/term, downloading fee structure PDFs, and tracking M-Pesa payments and invoices.",
    category: "Finance",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 7,
    title: "Finance Reports: Collections & Class Analysis",
    description:
      "Reading the collections report, the class analysis breakdown, and exporting the detailed finance report.",
    category: "Finance",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
  {
    id: 8,
    title: "Messaging & School Communications",
    description:
      "Sending 1:1 messages, broadcasting announcements, and checking notifications so nothing gets missed.",
    category: "Getting Started",
    videoSrc: defaultVideo,
    thumbnail: defaultThumb,
  },
];

function VideoModal({ video, onClose }) {
  if (!video) return null;
  return (
    <div
      className="video-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal__header">
          <h6>{video.title}</h6>
          <button className="video-modal__close" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="video-modal__body">
          {/* `poster` shows default-video.png until the user hits play,
              then the actual video takes over. `preload="metadata"` keeps
              the initial fetch light. */}
          <video
            src={video.videoSrc}
            poster={video.thumbnail}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", height: "100%", background: "#000" }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </div>
  );
}

export default function UserManual() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [playingVideo, setPlayingVideo] = useState(null);

  const filteredVideos =
    activeCategory === "All" ? VIDEOS : VIDEOS.filter((v) => v.category === activeCategory);

  return (
    <div className="manual-page">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: "User Manual", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">User Manual</h1>
          <p className="page-subtitle">
            Short training videos covering everything you need to use the Masomo System portal.
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-play-circle me-1"></i>
          {VIDEOS.length} videos
        </span>
      </div>

      {/* Category filter pills */}
      <ul className="nav nav-pills mb-4">
        {CATEGORIES.map((cat) => (
          <li className="nav-item" key={cat}>
            <button
              type="button"
              className={`nav-link ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
              style={{ border: "none" }}
            >
              {cat}
            </button>
          </li>
        ))}
      </ul>

      {/* Video grid — constrained and centered via .manual-page__content */}
      <div className="manual-page__content">
        <div className="manual-video-grid">
          {filteredVideos.map((video) => (
            <div className="video-card" key={video.id} onClick={() => setPlayingVideo(video)}>
              <div className="video-card__thumb">
                <img src={video.thumbnail} alt={video.title} />
                <div className="video-card__play">
                  <i className="bi bi-play-fill"></i>
                </div>
              </div>
              <div className="video-card__body">
                <span className="badge badge-blue mb-2">{video.category}</span>
                <h6 className="video-card__title">{video.title}</h6>
                <p className="video-card__desc">{video.description}</p>
              </div>
            </div>
          ))}
        </div>

        {filteredVideos.length === 0 && (
          <div className="empty-state">
            <i className="bi bi-camera-video"></i>
            <h6>No videos in this category yet</h6>
            <p className="text-muted-soft">Check back soon, or try a different category.</p>
          </div>
        )}
      </div>

      <VideoModal video={playingVideo} onClose={() => setPlayingVideo(null)} />
    </div>
  );
}