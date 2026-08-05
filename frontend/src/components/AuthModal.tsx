"use client";

import { useState, useEffect } from "react";
import { Film, X, Mail, Lock, User, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

interface AuthModalProps {
  mode: "signin" | "signup";
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ mode: initialMode, onClose, onSuccess }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === "signup") {
      const result = signUp(username, email, password);
      setSubmitting(false);
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Sign up failed");
      }
    } else {
      const result = signIn(identifier, password);
      setSubmitting(false);
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Sign in failed");
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-studio-accent/10 border border-studio-accent/20">
              <Film className="w-5 h-5 text-studio-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {mode === "signup" ? "Create Account" : "Welcome Back"}
              </h2>
              <p className="text-xs text-studio-muted">
                {mode === "signup" ? "Sign up to start creating" : "Sign in to your studio"}
              </p>
            </div>
          </div>
          <button
            className="text-studio-muted hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-studio-muted block mb-1.5 font-medium">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-studio-bg border border-studio-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-studio-muted/50 focus:border-studio-accent/50 focus:outline-none transition-colors"
                  placeholder="Choose a username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label className="text-xs text-studio-muted block mb-1.5 font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-studio-bg border border-studio-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-studio-muted/50 focus:border-studio-accent/50 focus:outline-none transition-colors"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
          )}

          {mode === "signin" && (
            <div>
              <label className="text-xs text-studio-muted block mb-1.5 font-medium">Username or Email</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-studio-bg border border-studio-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-studio-muted/50 focus:border-studio-accent/50 focus:outline-none transition-colors"
                  placeholder="Enter username or email"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-studio-muted block mb-1.5 font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-studio-bg border border-studio-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-studio-muted/50 focus:border-studio-accent/50 focus:outline-none transition-colors"
                placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-studio-accent hover:bg-studio-accentHover text-white rounded-lg font-medium text-sm transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === "signup" ? "Create Account" : "Sign In"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-studio-muted">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                className="text-studio-accent hover:underline font-medium"
                onClick={() => setMode("signin")}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                className="text-studio-accent hover:underline font-medium"
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
