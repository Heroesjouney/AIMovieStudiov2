import sys

path = r'D:\GitHub\AIMovieStudiov2\frontend\src\components\timeline\TimelineEditor.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '      {/* Clip Properties Panel */}'
start_idx = content.find(start_marker)
if start_idx == -1:
    print('start not found')
    sys.exit(1)

end_marker = '      )}\n\n    </div>\n  );'
end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print('end not found')
    sys.exit(1)
end_idx += len('      )}')

new_block = '''      {/* Clip Properties Panel */}
      {showPropertiesPanel && selectedClip && (
        <div className="fixed right-0 top-0 bottom-0 z-40 w-72 bg-studio-panel border-l border-studio-border overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-studio-border sticky top-0 bg-studio-panel z-10">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-studio-accent" />
              <h3 className="text-sm font-medium">Clip Properties</h3>
            </div>
            <button className="text-studio-muted hover:text-studio-accent transition-colors" onClick={() => setShowPropertiesPanel(false)}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-3 space-y-4 text-xs">

            {/* Section: Info */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-studio-muted font-medium">Info</div>
              <div>
                <label className="text-studio-muted block mb-1">Name</label>
                <input
                  className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1.5 text-white focus:border-studio-accent/50 focus:outline-none transition-colors"
                  value={selectedClip.name}
                  onChange={(e) => {
                    if (selectedTrackType) renameClip(selectedTrackType, selectedClip.id, e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="text-studio-muted block mb-1">Source</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-white">{selectedClip.sourceType}</span>
                  <span className="text-studio-muted truncate" title={selectedClip.sourceUrl}>{selectedClip.sourceUrl.split('/').pop() || selectedClip.sourceUrl}</span>
                </div>
              </div>
            </div>

            {/* Section: Time */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-studio-muted font-medium">Time</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-studio-muted block mb-1">Start</label>
                  <div className="text-white font-mono bg-studio-bg border border-studio-border rounded px-2 py-1.5">{formatTime(selectedClip.startTime)}</div>
                </div>
                <div>
                  <label className="text-studio-muted block mb-1">Duration</label>
                  <div className="text-white font-mono bg-studio-bg border border-studio-border rounded px-2 py-1.5">
                    {typeof selectedClip.trimOutSeconds === "number" && selectedClip.trimOutSeconds > (selectedClip.trimInSeconds ?? 0)
                      ? formatTime(selectedClip.trimOutSeconds - (selectedClip.trimInSeconds ?? 0))
                      : typeof selectedClip.mediaDurationSeconds === "number"
                        ? formatTime(selectedClip.mediaDurationSeconds)
                        : "\\u2014"}
                  </div>
                </div>
                <div>
                  <label className="text-studio-muted block mb-1">Trim In</label>
                  <div className="text-white font-mono bg-studio-bg border border-studio-border rounded px-2 py-1.5">{formatTime(selectedClip.trimInSeconds)}</div>
                </div>
                <div>
                  <label className="text-studio-muted block mb-1">Trim Out</label>
                  <div className="text-white font-mono bg-studio-bg border border-studio-border rounded px-2 py-1.5">{typeof selectedClip.trimOutSeconds === "number" ? formatTime(selectedClip.trimOutSeconds) : "end"}</div>
                </div>
              </div>
            </div>

            {/* Section: Playback */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-studio-muted font-medium">Playback</div>
              {selectedTrackType === "video" && (
                <div>
                  <label className="text-studio-muted block mb-1">Speed</label>
                  <select
                    className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1.5 text-white focus:border-studio-accent/50 focus:outline-none transition-colors"
                    value={selectedClip.speed || 1}
                    onChange={(e) => {
                      if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { speed: Number(e.target.value) });
                    }}
                  >
                    <option value={0.25}>0.25x</option>
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x (Normal)</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-studio-muted block mb-1">Volume</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedClip.volume ?? 1}
                    onChange={(e) => {
                      if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { volume: Number(e.target.value) });
                    }}
                    className="flex-1 accent-studio-accent"
                  />
                  <span className="text-white font-mono w-10 text-right">{Math.round((selectedClip.volume ?? 1) * 100)}%</span>
                </div>
              </div>
              {selectedTrackType === "audio" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-studio-muted block mb-1">Fade In</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1.5 text-white font-mono focus:border-studio-accent/50 focus:outline-none transition-colors"
                        value={selectedClip.fadeInSeconds ?? 0}
                        onChange={(e) => updateTimelineClip("audio", selectedClip.id, { fadeInSeconds: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <span className="text-studio-muted">s</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-studio-muted block mb-1">Fade Out</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1.5 text-white font-mono focus:border-studio-accent/50 focus:outline-none transition-colors"
                        value={selectedClip.fadeOutSeconds ?? 0}
                        onChange={(e) => updateTimelineClip("audio", selectedClip.id, { fadeOutSeconds: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <span className="text-studio-muted">s</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section: Transitions */}
            {(selectedClip.transitionIn || selectedClip.transitionOut) && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-studio-muted font-medium">Transitions</div>
                {selectedClip.transitionIn && (
                  <div className="flex items-center justify-between bg-studio-bg border border-studio-border rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-white capitalize">{selectedClip.transitionIn.type.replace("_", " ")}</span>
                      <span className="text-studio-muted font-mono">{selectedClip.transitionIn.durationSeconds.toFixed(1)}s</span>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-300 transition-colors"
                      onClick={() => { if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { transitionIn: null }); }}
                      title="Remove transition in"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {selectedClip.transitionOut && (
                  <div className="flex items-center justify-between bg-studio-bg border border-studio-border rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-white capitalize">{selectedClip.transitionOut.type.replace("_", " ")}</span>
                      <span className="text-studio-muted font-mono">{selectedClip.transitionOut.durationSeconds.toFixed(1)}s</span>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-300 transition-colors"
                      onClick={() => { if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { transitionOut: null }); }}
                      title="Remove transition out"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Section: Linked Group */}
            {selectedClip.groupId && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-studio-muted font-medium">Linked Group</div>
                <div className="flex items-center justify-between bg-studio-bg border border-studio-border rounded px-2 py-1.5">
                  <span className="text-white font-mono">{selectedClip.groupId}</span>
                  <button
                    className="text-red-400 hover:text-red-300 text-[10px] transition-colors"
                    onClick={() => unlinkClipGroup(selectedClip.id)}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}'''

content = content[:start_idx] + new_block + content[end_idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('REPLACED successfully')
