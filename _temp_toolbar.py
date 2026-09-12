import sys

path = r'D:\GitHub\AIMovieStudiov2\frontend\src\components\timeline\TimelineEditor.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '            <div className="p-3 border-b border-studio-border bg-studio-panel flex items-center justify-between">'
start_idx = content.find(start_marker)
if start_idx == -1:
    print('start not found')
    sys.exit(1)

end_marker = '            </div>\n\n            <div className="flex-1 flex overflow-hidden">'
end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print('end not found')
    sys.exit(1)
end_idx += len('            </div>\n')

new_block = '''            <div className="px-3 py-2 border-b border-studio-border bg-studio-panel flex items-center justify-between gap-2">
              {/* Left: Edit tools */}
              <div className="flex items-center gap-1">
                {/* Undo/Redo */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-studio-muted"
                  onClick={() => undo()}
                  disabled={undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-studio-muted"
                  onClick={() => redo()}
                  disabled={redoStack.length === 0}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-studio-border mx-1" />

                {/* Razor/Split */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-studio-muted"
                  onClick={() => {
                    if (selectedClipId && selectedTrackType) {
                      splitClipAtPlayhead(selectedTrackType, selectedClipId, playheadSeconds);
                    }
                  }}
                  disabled={!selectedClipId}
                  title="Split clip at playhead (S)"
                >
                  <Scissors className="w-4 h-4" />
                </button>

                {/* Copy/Paste */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-studio-muted"
                  onClick={() => handleCopyClip()}
                  disabled={!selectedClipId}
                  title="Copy clip (Ctrl+C)"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-studio-muted"
                  onClick={() => handlePasteClip()}
                  disabled={!clipboardClip}
                  title="Paste clip (Ctrl+V)"
                >
                  <ClipboardPaste className="w-4 h-4" />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-studio-border mx-1" />

                {/* Snap toggle */}
                <button
                  className={"inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors " + (snapEnabled ? "text-studio-accent bg-studio-accent/15" : "text-studio-muted hover:text-studio-text hover:bg-studio-border/40")}
                  onClick={() => setSnapEnabled((v) => !v)}
                  title="Toggle snap-to-grid (N)"
                >
                  <Magnet className="w-4 h-4" />
                </button>

                {/* Transitions dropdown */}
                <div className="relative">
                  <button
                    className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors text-xs"
                    onClick={() => setShowTransitionsMenu((v) => !v)}
                    title="Transitions (drag onto a clip)"
                  >
                    <Blend className="w-4 h-4 text-purple-400" />
                    Transition
                  </button>
                  {showTransitionsMenu && (
                    <>
                      <div className="fixed inset-0 z-30" style={{ pointerEvents: draggingTransition ? "none" : "auto" }} onClick={() => setShowTransitionsMenu(false)} />
                      <div className="absolute top-8 left-0 z-40 bg-studio-panel border border-studio-border rounded-md shadow-lg py-1 min-w-[200px]">
                        {([
                          { type: "fade_black" as TransitionType, label: "Fade to Black", desc: "Classic film fade", color: "bg-gray-800", Icon: Moon },
                          { type: "fade_white" as TransitionType, label: "Fade to White", desc: "Bright flash transition", color: "bg-gray-200", Icon: Sun },
                          { type: "dissolve" as TransitionType, label: "Cross Dissolve", desc: "Smooth blend between clips", color: "bg-purple-600", Icon: Blend },
                          { type: "wipe_left" as TransitionType, label: "Wipe Left", desc: "Reveal from right to left", color: "bg-blue-600", Icon: ArrowLeft },
                          { type: "wipe_right" as TransitionType, label: "Wipe Right", desc: "Reveal from left to right", color: "bg-blue-600", Icon: ArrowRight },
                        ]).map((t) => (
                          <div
                            key={t.type}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-transition", JSON.stringify({ type: t.type, label: t.label }));
                              e.dataTransfer.effectAllowed = "copy";
                              setDraggingTransition({ type: t.type, label: t.label });
                            }}
                            onDragEnd={() => {
                              setDraggingTransition(null);
                              setShowTransitionsMenu(false);
                            }}
                            title={"Drag \\"" + t.label + "\\" onto a clip edge"}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-studio-border/40 cursor-grab active:cursor-grabbing border-b border-studio-border/30 last:border-b-0"
                          >
                            <div className={"flex items-center justify-center w-6 h-6 rounded " + t.color + " flex-shrink-0"}>
                              <t.Icon className={"w-3.5 h-3.5 " + (t.type === "fade_white" ? "text-gray-700" : "text-white")} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-studio-text font-medium leading-tight">{t.label}</span>
                              <span className="text-[10px] text-studio-muted leading-tight">{t.desc}</span>
                            </div>
                          </div>
                        ))}
                        <div className="px-3 py-1.5 text-[10px] text-studio-muted border-t border-studio-border/30">
                          Drop on left half = transition in - right half = transition out
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right: View + Export */}
              <div className="flex items-center gap-2">
                {/* Playback error */}
                {playbackError && <div className="text-[11px] text-red-400 max-w-[240px] truncate" title={playbackError}>{playbackError}</div>}

                {/* Divider */}
                <div className="w-px h-5 bg-studio-border mx-1" />

                {/* Format selector */}
                <select
                  className="h-7 px-2 rounded-md bg-studio-bg border border-studio-border text-xs text-studio-muted hover:border-studio-accent/50 transition-colors cursor-pointer"
                  value={selectedTimelineFormat.id}
                  onChange={(e) => {
                    const fmt = TIMELINE_FORMATS.find((f) => f.id === e.target.value);
                    if (fmt) setTimelineFormat({ aspectRatio: fmt.aspectRatio, width: fmt.width, height: fmt.height });
                  }}
                  title="Timeline format"
                >
                  {TIMELINE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label} ({f.width}x{f.height})</option>
                  ))}
                </select>

                {/* Zoom controls */}
                <div className="flex items-center gap-0.5">
                  <button
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors"
                    onClick={() => setPxPerSecond((v) => Math.max(2, v - 10))}
                    title="Zoom out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min={2}
                    max={200}
                    step={5}
                    value={pxPerSecond}
                    onChange={(e) => setPxPerSecond(Number(e.target.value) || 30)}
                    className="w-20"
                    title="Zoom level"
                  />
                  <button
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors"
                    onClick={() => setPxPerSecond((v) => Math.min(200, v + 10))}
                    title="Zoom in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-studio-border mx-1" />

                {/* Fullscreen preview */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors"
                  onClick={() => setFullscreenPreview(true)}
                  title="Fullscreen preview"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {/* Playhead center mode */}
                <button
                  className={"inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors " + (playheadCenter ? "text-studio-accent bg-studio-accent/15" : "text-studio-muted hover:text-studio-text hover:bg-studio-border/40")}
                  onClick={() => setPlayheadCenter((v) => !v)}
                  title="Toggle playhead center mode"
                >
                  <RectangleHorizontal className="w-4 h-4" />
                </button>

                {/* Keyboard shortcuts */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-border/40 transition-colors"
                  onClick={() => setShowShortcutsPanel(true)}
                  title="Keyboard shortcuts (?)"
                >
                  <KeyboardIcon className="w-4 h-4" />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-studio-border mx-1" />

                {/* Export preset */}
                <select
                  className="h-7 px-2 rounded-md bg-studio-bg border border-studio-border text-xs text-studio-muted hover:border-studio-accent/50 transition-colors cursor-pointer"
                  value={exportPreset}
                  onChange={(e) => setExportPreset(e.target.value as typeof exportPreset)}
                  title="Export quality preset"
                >
                  <option value="source">Source</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                </select>

                {/* Render to MP4 button */}
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 transition-colors text-xs font-medium disabled:opacity-50"
                  onClick={handleRender}
                  disabled={renderStatus === "processing" || renderStatus === "pending"}
                  title="Render timeline to MP4"
                >
                  {renderStatus === "processing" || renderStatus === "pending" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering...</>
                  ) : (
                    <><Clapperboard className="w-3.5 h-3.5" /> Render</>
                  )}
                </button>
                {renderResultUrl && renderStatus === "completed" && (
                  <a
                    href={renderResultUrl}
                    download
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-studio-bg border border-studio-border hover:border-studio-accent/50 text-xs text-studio-muted hover:text-studio-accent transition-colors"
                    title="Download rendered video"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                )}
                {renderError && (
                  <span
                    className="text-[10px] text-red-400 max-w-[200px] truncate cursor-help"
                    title={renderError}
                    onClick={() => { try { navigator.clipboard.writeText(renderError); } catch {} }}
                  >
                    {renderError.slice(0, 80)}{renderError.length > 80 ? "..." : ""}
                  </span>
                )}
              </div>
            </div>
'''

content = content[:start_idx] + new_block + content[end_idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('REPLACED successfully')
