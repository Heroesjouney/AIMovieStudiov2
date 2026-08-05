"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Film, ArrowRight, Image as ImageIcon, Camera, Video, Music, Clapperboard, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { AuthModal } from "@/components/AuthModal";
import { UserMenu } from "@/components/UserMenu";

const features = [
  { icon: ImageIcon, title: "Asset Generation", desc: "Characters, locations, props & vehicles with Qwen, Nano Banana, Krea & more" },
  { icon: Clapperboard, title: "Storyboard Builder", desc: "Compose shots, bind assets, and generate frames with reproducible recipes" },
  { icon: Camera, title: "3D Camera Director", desc: "Generate multiple camera angles from a single frame using depth-based 3D reconstruction" },
  { icon: Video, title: "Video Generation", desc: "Local LTX/Wan or cloud Seedance/Minimax H3 — image-to-video with camera movement presets" },
  { icon: Music, title: "Audio & TTS", desc: "Fish Speech & Chatterbox TTS with voice cloning, Stable Audio music, Hunyuan foley" },
  { icon: Sparkles, title: "Timeline & Export", desc: "Full NLE timeline with transitions, trim, multi-track audio, and export to EDL or Premiere XML" },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/projects");
    }
  }, [user, loading, router]);

  const handleAuthSuccess = () => {
    setAuthMode(null);
    router.push("/projects");
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-8 py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-studio-bg pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-studio-accent/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top-right auth area */}
      <div className="absolute top-6 right-8 z-20">
        {loading ? (
          <div className="w-8 h-8 rounded-full bg-studio-border animate-pulse" />
        ) : user ? (
          <UserMenu />
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuthMode("signin")}
              className="px-4 py-1.5 rounded-lg text-sm text-studio-text hover:text-white border border-studio-border hover:border-studio-accent/30 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className="px-4 py-1.5 rounded-lg text-sm bg-studio-accent hover:bg-studio-accentHover text-white font-medium transition-colors"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>

      <div className="max-w-5xl w-full relative z-10">
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-studio-accent/10 border border-studio-accent/20 mb-6">
            <Film className="w-8 h-8 text-studio-accent" />
          </div>
          <h1 className="text-5xl font-bold mb-4">
            <span className="gradient-text">AI Movie Studio 2</span>
          </h1>
          <p className="text-studio-muted text-lg max-w-2xl mx-auto leading-relaxed">
            A professional, model-agnostic AI filmmaking workstation. Generate assets,
            build storyboards with 3D camera direction, create video clips, and assemble
            timelines — all in one place.
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-12 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          {user ? (
            <>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-studio-accent hover:bg-studio-accentHover text-white rounded-xl font-medium transition-all hover:scale-[1.02] shadow-lg shadow-studio-accent/20"
              >
                View Projects
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/project/default"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-studio-panel hover:bg-studio-border border border-studio-border text-studio-text rounded-xl font-medium transition-all hover:scale-[1.02]"
              >
                Quick Start
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => setAuthMode("signup")}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-studio-accent hover:bg-studio-accentHover text-white rounded-xl font-medium transition-all hover:scale-[1.02] shadow-lg shadow-studio-accent/20"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAuthMode("signin")}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-studio-panel hover:bg-studio-border border border-studio-border text-studio-text rounded-xl font-medium transition-all hover:scale-[1.02]"
              >
                Sign In
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={i}
                className="group p-5 bg-studio-panel/50 hover:bg-studio-panel rounded-xl border border-studio-border hover:border-studio-accent/30 transition-all hover:translate-y-[-2px]"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-studio-accent/10 mb-3 group-hover:bg-studio-accent/20 transition-colors">
                  <Icon className="w-5 h-5 text-studio-accent" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{feature.title}</h3>
                <p className="text-xs text-studio-muted leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-16 text-xs text-studio-muted/50">
          Model-agnostic Driver System • Local ComfyUI + Cloud APIs
        </div>
      </div>

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}
